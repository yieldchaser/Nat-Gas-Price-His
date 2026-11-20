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
