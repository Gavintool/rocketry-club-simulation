"""Compare browser flight calculations with the Python reference model."""
import json
from pathlib import Path
import shutil
import subprocess
import unittest
from simulation import simulate

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which('node'), 'Node.js is needed for browser/Python parity tests')
class BrowserParityTests(unittest.TestCase):
    def test_browser_matches_python(self):
        cases = [dict(wind=3), dict(wind=3,recovery=False),
                 dict(wind=-5,launch_angle=-3), dict(wind=0,recovery=False),
                 dict(wind=2,length=1,stability=2,chute_diameter=.8)]
        source = "import {simulate} from './simulation.js'; console.log(JSON.stringify(" + json.dumps(cases) + ".map(p=>simulate(p))));"
        browser = json.loads(subprocess.check_output(['node','--input-type=module','-e',source],cwd=ROOT,text=True))
        for config, js in zip(cases,browser):
            with self.subTest(config=config):
                py=simulate(.5,.05,20,1.5,.75,.04,include_trajectory=True,**config)
                for key in ('apogee_m','flight_time_s','downrange_m','landing_speed_m_s'):
                    self.assertAlmostEqual(py[key],js[key],delta=1e-6)
                self.assertEqual(len(py['trajectory']),len(js['trajectory']))
                for a,b in zip(py['trajectory'][::25],js['trajectory'][::25]):
                    for x,y in zip(a,b):
                        if x is None:self.assertIsNone(y)
                        else:self.assertAlmostEqual(x,y,delta=1e-5)

    def test_browser_validation(self):
        source = "import {simulate} from './simulation.js'; for (const p of [{wind:NaN},{mass:0},{thrust:1}]) { let rejected=false; try {simulate(p);} catch {rejected=true;} if(!rejected) process.exit(1); }"
        subprocess.check_call(['node','--input-type=module','-e',source],cwd=ROOT)
