import math
import unittest
from simulation import simulate

PARAMS = (.5, .05, 20, 1.5, .75, .04)


class FlightTests(unittest.TestCase):
    def test_vertical_solution_without_drag(self):
        r = simulate(.5, 0, 20, 1.5, 0, .04, recovery=False, dt=.002, include_trajectory=True)
        acceleration = 20/.5 - 9.81
        expected = .35 + .5*acceleration*1.5**2 + (acceleration*1.5)**2/(2*9.81)
        self.assertAlmostEqual(r['apogee_m'], expected, delta=.15)
        self.assertEqual(r['downrange_m'], 0)
        self.assertIsNone(r['trajectory'][0][5])

    def test_mirrored_wind_and_launch_angles(self):
        a = simulate(*PARAMS, wind=3, launch_angle=3, recovery=False)
        b = simulate(*PARAMS, wind=-3, launch_angle=-3, recovery=False)
        self.assertAlmostEqual(a['apogee_m'], b['apogee_m'])
        self.assertAlmostEqual(a['downrange_m'], -b['downrange_m'])

    def test_descent_pitch_and_recovery(self):
        ballistic = simulate(*PARAMS, wind=3, recovery=False, include_trajectory=True)
        recovered = simulate(*PARAMS, wind=3, recovery=True, include_trajectory=True)
        self.assertLess(math.cos(ballistic['trajectory'][-1][6]), -.9)
        self.assertLess(recovered['landing_speed_m_s'], ballistic['landing_speed_m_s']/3)
        self.assertEqual(recovered['trajectory'][-1][8], 1)
        names = [e['name'] for e in recovered['events']]
        self.assertLess(names.index('Apogee'), names.index('Parachute deployment'))
        for s in recovered['trajectory']:
            self.assertGreaterEqual(s[1], 0)
            self.assertTrue(s[5] is None or 0 <= s[5] <= 180)
        self.assertEqual(recovered['events'][-1]['name'], 'Ground contact')

    def test_step_convergence(self):
        coarse = simulate(*PARAMS, wind=3, dt=.004)
        fine = simulate(*PARAMS, wind=3, dt=.002)
        for key in ('apogee_m', 'downrange_m', 'flight_time_s'):
            self.assertAlmostEqual(coarse[key], fine[key], delta=.15)

    def test_invalid_inputs(self):
        for kwargs in ({'wind': math.nan}, {'launch_angle': 46}, {'length': .02}, {'dt': 0}):
            with self.assertRaises(ValueError):
                simulate(*PARAMS, **kwargs)
        with self.assertRaises(ValueError):
            simulate(.5, .05, 1, 1.5, .75, .04)


if __name__ == '__main__':
    unittest.main()
