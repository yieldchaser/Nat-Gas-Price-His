"""Pipeline tests: expiry calendar, archive merge semantics, dataset build.

Run:  python -m unittest discover -s tests
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))

import archive_io  # noqa: E402
import build_data  # noqa: E402
from contract_calendar import contract_expiry, is_business_day, parse_ticker, rule_applies  # noqa: E402


def load_data(name):
    with open(os.path.join(ROOT, 'data', name)) as f:
        return json.load(f)


def decode(c):
    d = date.fromisoformat(c['d0']).toordinal()
    out = []
    for dt, p in zip(c['dt'], c['p']):
        d += dt
        out.append((date.fromordinal(d).isoformat(), p))
    return out


class CalendarTests(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(parse_ticker('NGZ26'), ('NG', 2026, 12))
        self.assertEqual(parse_ticker('TTFF27.NYM'), ('TG', 2027, 1))
        self.assertEqual(parse_ticker('NGF99'), ('NG', 1999, 1))

    def test_known_expiries(self):
        # Last trading days confirmed by the archive / exchange calendars.
        cases = {
            'NGZ26': '2026-11-25',  # Thanksgiving 26 Nov excluded, Fri 27 Nov counted
            'NGZ25': '2025-11-25',
            'NGZ24': '2024-11-26',
            'NGZ10': '2010-11-24',  # pre-2011: Friday after Thanksgiving not counted
            'NGF11': '2010-12-28',  # Sat New Year -> Fri 31 Dec 2010 closed
            'NGF22': '2021-12-29',  # ... but not in 2021
            'NGG22': '2022-01-27',
            'NGK26': '2026-04-28',
            'TGU21': '2021-08-27',  # UK summer bank holiday 30 Aug
            'TGM21': '2021-05-27',  # UK spring bank holiday 31 May
        }
        for t, exp in cases.items():
            self.assertEqual(contract_expiry(t).isoformat(), exp, t)

    def test_business_days(self):
        self.assertFalse(is_business_day(date(2026, 11, 26)))   # Thanksgiving
        self.assertTrue(is_business_day(date(2026, 11, 27)))    # Black Friday (post-2010)
        self.assertFalse(is_business_day(date(2026, 4, 3)))     # Good Friday 2026
        self.assertFalse(is_business_day(date(2026, 6, 19)))    # Juneteenth
        self.assertTrue(is_business_day(date(2021, 6, 18)))     # Juneteenth observed only from 2022

    def test_rule_matches_archive(self):
        """The rule must reproduce the archived last trading day for the vast
        majority of settled contracts (exceptions are vendor-era ambiguities)."""
        data = load_data('hh.json')['contracts']
        checked = matched = 0
        for t, c in data.items():
            if c['s'] != 'settled' or not rule_applies(t):
                continue
            checked += 1
            matched += decode(c)[-1][0] == contract_expiry(t).isoformat()
        self.assertGreater(checked, 300)
        self.assertGreaterEqual(matched / checked, 0.95, f'{matched}/{checked}')


class CleanContractTests(unittest.TestCase):
    def test_fill_forward_tail_dropped(self):
        pts = [('2001-12-26', 2.911), ('2001-12-27', 2.555), ('2001-12-28', 2.555), ('2001-12-31', 2.555)]
        out, exp, status, _ = build_data.clean_contract('NGF02', pts, date(2026, 1, 1))
        self.assertEqual(out[-1], ('2001-12-27', 2.555))
        self.assertEqual((exp, status), ('2001-12-27', 'settled'))

    def test_incomplete_never_settled(self):
        pts = [('2026-03-26', 30.0), ('2026-03-27', 31.0)]
        _, exp, status, _ = build_data.clean_contract('TGK26', pts, date(2026, 11, 20))
        self.assertEqual(status, 'incomplete')
        self.assertEqual(exp, '2026-04-29')

    def test_active(self):
        pts = [('2026-11-19', 3.1), ('2026-11-20', 3.2)]
        _, exp, status, _ = build_data.clean_contract('NGZ26', pts, date(2026, 11, 20))
        self.assertEqual((exp, status), ('2026-11-25', 'active'))

    def test_encode_roundtrip(self):
        pts = [('2026-01-02', 1.0), ('2026-01-05', 2.0), ('2026-01-06', 3.5)]
        d0, dt, p = build_data.encode_series(pts)
        self.assertEqual(decode({'d0': d0, 'dt': dt, 'p': p}), pts)


class MergeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._dirs = dict(archive_io.MARKET_DIRS)
        archive_io.MARKET_DIRS['NG'] = os.path.join(self.tmp, 'Henry Hub')

    def tearDown(self):
        archive_io.MARKET_DIRS.clear()
        archive_io.MARKET_DIRS.update(self._dirs)
        shutil.rmtree(self.tmp)

    def test_merge_adds_corrects_and_never_deletes(self):
        today = date(2026, 11, 20)
        archive_io.merge_rows('NGX26', {'2026-04-01': 3.0, '2026-04-02': 3.1}, today)
        added, corrected = archive_io.merge_rows(
            'NGX26', {'2026-04-02': 3.15, '2026-10-28': 3.3, '2026-10-29': 9.9}, today)
        rows = archive_io.read_rows(archive_io.csv_path('NGX26'))
        self.assertEqual((added, corrected), (1, 1))
        self.assertEqual(rows, {'2026-04-01': 3.0, '2026-04-02': 3.15, '2026-10-28': 3.3})  # 10-29 > expiry

    def test_internal_ticker(self):
        self.assertEqual(archive_io.internal_ticker('TTFZ26.NYM'), 'TGZ26')
        self.assertEqual(archive_io.internal_ticker('NGF27.NYM'), 'NGF27')
        self.assertIsNone(archive_io.internal_ticker('NG=F'))


class DatasetTests(unittest.TestCase):
    def test_built_files_consistent(self):
        for name in ('hh.json', 'ttf.json'):
            payload = load_data(name)
            for t, c in payload['contracts'].items():
                self.assertEqual(len(c['dt']), len(c['p']), t)
                pts = decode(c)
                dates = [d for d, _ in pts]
                self.assertEqual(dates, sorted(set(dates)), f'{t} dates not strictly increasing')
                self.assertTrue(all(p > 0 for _, p in pts), t)
                self.assertLessEqual(dates[-1], c['x'], f'{t} has rows after expiry')
                if c['s'] == 'settled':
                    self.assertEqual(dates[-1], c['x'], f'{t} settled but history stops early')


if __name__ == '__main__':
    unittest.main()


class FixtureTests(unittest.TestCase):
    def test_expiry_fixture_in_sync(self):
        """tests/fixtures/expiries.json is shared with the JS calendar tests;
        both implementations must reproduce it exactly."""
        from contract_calendar import CODES
        with open(os.path.join(ROOT, 'tests', 'fixtures', 'expiries.json')) as f:
            fixture = json.load(f)
        for pre in ('NG', 'TG'):
            for y in range(1998, 2036):
                for m in range(1, 13):
                    t = f'{pre}{CODES[m - 1]}{y % 100:02d}'
                    self.assertEqual(contract_expiry(t).isoformat(), fixture[t], t)


class SessionTests(unittest.TestCase):
    def test_sessions(self):
        self.assertFalse(archive_io.is_session('NGF27', '2026-11-15'))   # Sunday bar
        self.assertFalse(archive_io.is_session('NGF27', '2026-09-07'))   # Labor Day
        self.assertTrue(archive_io.is_session('NGF27', '2026-11-27'))    # Black Friday trades
        self.assertTrue(archive_io.is_session('NGF97', '1997-01-20'))    # vendor era MLK session
        self.assertFalse(archive_io.is_session('TGF27', '2026-11-15'))
        self.assertTrue(archive_io.is_session('TGF27', '2026-09-07'))    # TTF trades US holidays


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._dirs = dict(archive_io.MARKET_DIRS)
        archive_io.MARKET_DIRS['TG'] = os.path.join(self.tmp, 'Dutch TTF')
        import import_price_history
        self.imp = import_price_history

    def tearDown(self):
        archive_io.MARKET_DIRS.clear()
        archive_io.MARKET_DIRS.update(self._dirs)
        shutil.rmtree(self.tmp)

    def _csv(self, name, rows, header='Time,Open,High,Low,Latest,Change,%Change,Volume,"Open Int"'):
        p = os.path.join(self.tmp, name)
        with open(p, 'w') as f:
            f.write(header + '\n')
            for d, v in rows:
                f.write(f'{d},{v},{v},{v},{v},0,0%,0,0\n')
            f.write('"Downloaded from Barchart.com as of 11-20-2026"\n')
        return p

    def test_barchart_export_extends_archive(self):
        archive_io.merge_rows('TGK26', {'2026-03-26': 30.0, '2026-03-27': 31.0}, date(2026, 11, 20))
        p = self._csv('tgk26_price-history-11-20-2026.csv',
                      [('2026-04-29', 33.0), ('2026-04-28', 32.5), ('2026-03-28', 99.0), ('2026-03-27', 31.0), ('2026-04-30', 40.0)])
        added = self.imp.import_file(p, today=date(2026, 11, 20))
        rows = archive_io.read_rows(archive_io.csv_path('TGK26'))
        self.assertEqual(added, 2)                        # Sat 28 Mar and post-expiry 30 Apr skipped
        self.assertEqual(max(rows), '2026-04-29')         # reaches last trading day

    def test_mismatched_file_rejected(self):
        archive_io.merge_rows('TGK26', {f'2026-03-{d:02d}': 30.0 for d in (23, 24, 25, 26, 27)}, date(2026, 11, 20))
        p = self._csv('TGK26.csv', [(f'2026-03-{d:02d}', 300.0) for d in (23, 24, 25, 26, 27)] + [('2026-04-01', 310.0)])
        self.assertEqual(self.imp.import_file(p, today=date(2026, 11, 20)), 0)
        self.assertNotIn('2026-04-01', archive_io.read_rows(archive_io.csv_path('TGK26')))

    def test_repo_barchart_exports_match_archive(self):
        archive_io.MARKET_DIRS.update(self._dirs)
        rows = self.imp.parse_file(os.path.join(ROOT, 'data', 'tgz25_price-history-04-06-2026.csv'))
        ok, why = self.imp.validate('TGZ25', rows, archive_io.read_rows(archive_io.csv_path('TGZ25')))
        self.assertTrue(ok, why)


class FxTests(unittest.TestCase):
    def test_fx_history_shape(self):
        fx = load_data('fx_eurusd.json')
        self.assertEqual(len(fx['dates']), len(fx['rate']))
        self.assertEqual(len(fx['dates']), len(fx['src']))
        self.assertLessEqual(fx['dates'][0], '1999-01-04')
        self.assertTrue(all(0.8 < r < 1.7 for r in fx['rate']))
        self.assertEqual(fx['dates'], sorted(set(fx['dates'])))
        self.assertTrue(all(date.fromisoformat(d).weekday() < 5 for d in fx['dates']))


class NeighbourCheckTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._dirs = dict(archive_io.MARKET_DIRS)
        archive_io.MARKET_DIRS['TG'] = os.path.join(self.tmp, 'Dutch TTF')
        import import_price_history
        self.imp = import_price_history
        archive_io.merge_rows('TGK26', {'2026-03-27': 54.5}, date(2026, 11, 20))
        archive_io.merge_rows('TGQ26', {'2026-04-29': 46.859}, date(2026, 11, 20))

    def tearDown(self):
        archive_io.MARKET_DIRS.clear()
        archive_io.MARKET_DIRS.update(self._dirs)
        shutil.rmtree(self.tmp)

    def test_isolated_settlement_needs_a_close_neighbour(self):
        archive = archive_io.read_rows(archive_io.csv_path('TGK26'))
        ok, why = self.imp.validate('TGK26', {'2026-04-29': 46.853}, archive)
        self.assertTrue(ok, why)                                   # TGQ26 within 0.01%
        ok, _ = self.imp.validate('TGK26', {'2026-04-29': 60.0}, archive)
        self.assertFalse(ok)                                       # 28% away: rejected


class VersionStampTests(unittest.TestCase):
    def test_module_versions_current(self):
        """Every browser import carries the current content hash (run
        `python scripts/stamp_versions.py` after editing src/js)."""
        import stamp_versions
        stale, _ = stamp_versions.stamp(check=True)
        self.assertEqual(stale, [], f'stale version tags: {stale} — run python scripts/stamp_versions.py')
