Known Bugs by Tab  
1. Price Tab 
1.1 Whenever i reload and the Prices tab the year selector just shows years till 2026 and after 
selecting diff years ( lets say 2024 ) only does the years beyond 2026 get activated. 
1.2 Are Prices & Metrics being displayed for the all the years actually correct beyond 2026 also 
in greater scrutiny and is the 5Y range / 5Y Avg & other metrics being calculated for these 
actually correct mathematically or nah ? 
1.3 Same goes for Dutch TTF maths too , that needs verification too & at some points when the 
range is being dragged the x-axis logic disappears only except one point that needs fixing too. 
2. Spreads tab  
2.1 Range slider not working properly for the Lifecycle Resolution (vs Trading Day) , chart and 
the range slider are not in sync especially when nearer values are dragged onto ( day 150+) , 
also KPI cards needs fixing for this chart too ( the values should be maybe displayed only for 
activated years ) 
2.2 This is not a bug , but preemptively verifying , check the maths behind Spread History 41 
years table and is everything being computed alright or nah. That is max , min , avg , At -10d , 
At-90D . Just verify and fix if bad values are being spit out. 
3. Forward Curve Tab  
3.1 All is fine and it took a long time to fix the chart , so don’t change anything just one thing that 
whenever the full strip is visible by default the values for some of the months especially at top 
ones are not visible on the zoomed out version , as soon as ya zoom in they are visible but just 
this one small thing. 
3.2 The table below the range slider in this tab needs to be centre aligned  
4.Expiry Prices  
4.1. The tooltips ( small # thing besides the top months ) are visible the months on the top of 
their game , similarly a similar one should be visible for months at the bottom of their game ( rest 
looks fine as fuck ) , also investigate the logic behind the Avg ( All ) & 5Y Avg & 3Y Avg, , they 
are not taking the most recent years into their calculations right as this is not ok i think.They 
should dynamically adjust. 
4.2  Dec 2025 expiry prices are not visible , investigate & fix ( this isn’t some major logic bug 
right ) ,  
4.3 In the EXPIRY HISTORY — 36 contracts chart , the displayed metrics like 5Y Avg , All Avg , 
are not toggable on or of a per selection as done in the Daily Tracker Price History — NG=F 
chart as in that 52W H , 52W L , 360D Avg ( they can be activated , deactivated see that) 
4.4 Also investigate if the chart and the range slider are in proper sync or nah & if not fix .  
Basically in the chart is zoomed out or in the range slider should automatically adjust right both 
should be in perfect sync and same goes for other charts in the website too right . 
4.5 The year range selector (10y , 20y , All , see the colors they are fucked , why are they white 
background and also they should be in the top right and more options need to be introduced 
that is 5 Y , 3 Y & no need for the words Year selector right )  
5. Daily Tracker  
5.1  Same thing , all fine just the range selector and the chart are not in proper sync ( like its 
pretty good compared to others but still if the chart is zoomed in or out with the use of mouse 
after a range is selected the ranger should automatically move right , like when it does when a 
time range is selected from the top right and it moves on its own )  
5.2 NG vs TTF Spread  
1. Chart KPIs not visible like the other charts , range should be at top right and their color 
background which is white currently needs to be fixed to match with the background like 
the others  
2. Also investigate the maths or the values being displayed in this chart , all are correct 
right  
5.3 In the Weekly % Change chart the range slider is completely not working & other similar 
issues like the 5y , 10y , All , see the colors they are fucked , why are they white background 
and also they should be in the top right and more options need to be introduced that is 5 Y , 3 Y 
& no need for the words Year selector right  & also the range slider and the chart should be in 
proper sync like others after they are fixed. 
6. General issues across all the tables  
I feel all the values in all tables are right aligned while the column titles are middle aligned , this 
should be fixed right.  