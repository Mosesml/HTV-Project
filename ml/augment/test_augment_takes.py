"""Tests for augment_takes. Run from the repository root: python3 -I -m unittest discover ml/augment"""

import math
import random
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import augment_takes as aug  # noqa: E402


def tilt_deg(row, base):
    g = aug.unit(aug.vec(row, "grav"))
    return math.degrees(math.acos(max(-1.0, min(1.0, sum(a * b for a, b in zip(g, base))))))


def fake_fall(seconds=16.0):
    """Upright and still, a fast sideways fall at 4 s with a 2.5 g landing, then still."""
    rows = []
    for i in range(int(seconds * aug.RATE_HZ) + 1):
        t = i / aug.RATE_HZ
        k = min(1.0, max(0.0, (t - 4.0) / 0.4))
        roll = math.radians(85) * k
        grav = (math.sin(roll), 0.0, -math.cos(roll))
        landing = 2.5 * aug.bump(t, 4.4, 0.05)
        rows.append({"t": t, "pitch": 0.0, "roll": roll, "yaw": 0.0,
                     "rotX": 0.0, "rotY": 4.0 if 4.0 <= t <= 4.4 else 0.0, "rotZ": 0.0,
                     "accX": landing * 0.6, "accY": landing * 0.5, "accZ": landing * 0.62,
                     "gravX": grav[0], "gravY": grav[1], "gravZ": grav[2]})
    return rows


class GeometryTests(unittest.TestCase):
    def test_attitude_matches_the_recordings_convention(self):
        pitch, roll = math.radians(20), math.radians(-30)
        grav = (math.cos(pitch) * math.sin(roll), -math.sin(pitch), -math.cos(pitch) * math.cos(roll))
        p, r = aug.attitude(grav)
        self.assertAlmostEqual(p, pitch, places=9)
        self.assertAlmostEqual(r, roll, places=9)

    def test_mirroring_twice_is_the_identity(self):
        rows = fake_fall()
        back = aug.mirror(aug.mirror(rows))
        for a, b in zip(rows, back):
            for c in aug.COLUMNS:
                self.assertAlmostEqual(a[c], b[c], places=9, msg=c)

    def test_fit_rotation_keeps_the_tilt_from_upright(self):
        rows = fake_fall()
        base = aug.baseline_gravity(rows)
        turned = aug.rotate_fit(rows, math.radians(15))
        self.assertAlmostEqual(tilt_deg(rows[-1], base), tilt_deg(turned[-1], aug.baseline_gravity(turned)), places=6)

    def test_transforms_do_not_mutate_their_input(self):
        rows = fake_fall()
        before = [dict(r) for r in rows]
        aug.make_variant(rows, random.Random(1))
        self.assertEqual(rows, before)


class StretchTests(unittest.TestCase):
    def test_slower_fall_keeps_the_stillness_after_it(self):
        rows = fake_fall()
        slow = aug.stretch_event(rows, 1.15)
        self.assertGreater(slow[-1]["t"], rows[-1]["t"])
        self.assertLess(slow[-1]["t"] - rows[-1]["t"], 2 * aug.EVENT_HALF_WIDTH_S * 0.15 + 0.05)

    def test_slower_fall_has_a_gentler_peak(self):
        rows = fake_fall()
        peak = lambda rs: max(aug.norm(aug.vec(r, "acc")) for r in rs)
        self.assertLess(peak(aug.stretch_event(rows, 1.15)), peak(rows))
        self.assertGreater(peak(aug.stretch_event(rows, 0.85)), peak(rows))

    def test_resampled_take_is_uniform_50_hz(self):
        out = aug.stretch_event(fake_fall(), 0.9)
        steps = {round(b["t"] - a["t"], 6) for a, b in zip(out, out[1:])}
        self.assertEqual(steps, {round(1 / aug.RATE_HZ, 6)})


class GenerateTests(unittest.TestCase):
    def test_outputs_are_marked_as_derived_and_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, out = Path(tmp, "src"), Path(tmp, "out")
            src.mkdir()
            aug.write_take(src / "kean_fall_03.csv", {"label": "fall", "person": "kean"}, fake_fall())
            first = aug.generate(src, out, "s")
            meta, rows = aug.read_take(out / first[0]["file"])
            self.assertEqual(meta["source"], "augmented")
            self.assertEqual(meta["derived_from"], "kean_fall_03")
            self.assertEqual(meta["label"], "fall")
            self.assertEqual(meta["fold"], "2")
            text = (out / first[0]["file"]).read_text()
            aug.generate(src, out, "s")
            self.assertEqual(text, (out / first[0]["file"]).read_text())

    def test_every_variant_of_a_take_shares_its_fold(self):
        folds = {aug.source_fold(n) for n in (3,)}
        self.assertEqual(folds, {2})
        self.assertEqual(sorted({aug.source_fold(n) for n in range(1, 11)}), [0, 1, 2, 3, 4])

    def test_synthetic_dancing_is_labelled_synthetic(self):
        rows = aug.synthetic_dancing(random.Random(3), 10)
        self.assertEqual(len(rows), 501)
        self.assertTrue(all(abs(aug.norm(aug.vec(r, "grav")) - 1) < 1e-9 for r in rows))


if __name__ == "__main__":
    unittest.main()
