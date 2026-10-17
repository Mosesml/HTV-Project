"""Generate augmented couch-fall training takes from real recordings (fall-model plan, step 7).

Every output file is derived data. Its header says so (`# source=augmented` or
`# source=synthetic`) and names the real take it came from (`# derived_from=`), so it can
never be mistaken for a recording. Rules for using it:

- Evaluate on the real takes only, never on generated ones.
- Folds are by source take: when a real take is held out, every variant derived from it
  is left out of training too (see `fold` in manifest.tsv; not .csv, so replay skips it).
- These are variations of one person on one couch. They add volume, not new people.

Usage, from the repository root:

    python3 -I ml/augment/augment_takes.py            # writes Motion/Fixtures/couch-augmented/
"""

import argparse
import csv
import math
import random
import sys
from pathlib import Path

COLUMNS = ["t", "pitch", "roll", "yaw", "rotX", "rotY", "rotZ",
           "accX", "accY", "accZ", "gravX", "gravY", "gravZ"]
RATE_HZ = 50.0
FOLDS = 5
FIXTURES = Path("app/modules/raveguard-native/ios/Motion/Fixtures")
DEFAULT_SOURCE = FIXTURES / "couch-baseline"
DEFAULT_OUT = FIXTURES / "couch-augmented"
# 10 real falls × 5 = 50 falls; 5 real sit-downs × 10 = 50 sit-downs.
VARIANTS_PER_LABEL = {"fall": 5, "sitdown": 10}
SYNTHETIC_DANCING_TAKES = 20
SYNTHETIC_DANCING_SECONDS = 120.0

# Plan, step 7.
FIT_ROTATION_DEG = 15.0
INTENSITY_RANGE = (0.8, 1.2)
STRETCH_RANGE = (0.85, 1.15)
EVENT_HALF_WIDTH_S = 1.2
NOISE_ACC_G = 0.01
NOISE_ROT_RAD_S = 0.02
NOISE_GRAV = 0.002


# ---------------------------------------------------------------- file format

def read_take(path):
    """Returns (meta, rows): the `# key=value` header and one float dict per sample."""
    meta, lines = {}, []
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                key, _, value = line[1:].strip().partition("=")
                meta[key.strip()] = value.strip()
            elif line.strip():
                lines.append(line)
    rows = [{k: float(v) for k, v in r.items()} for r in csv.DictReader(lines)]
    return meta, rows


def write_take(path, meta, rows):
    out = [f"# {k}={meta[k]}" for k in sorted(meta)]
    out.append(",".join(COLUMNS))
    for r in rows:
        out.append(",".join([f"{r['t']:.4f}"] + [f"{r[c]:.5f}" for c in COLUMNS[1:]]))
    Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- geometry

def norm(v):
    return math.sqrt(sum(x * x for x in v))


def unit(v):
    n = norm(v) or 1.0
    return tuple(x / n for x in v)


def rotate(v, axis, angle):
    """Rodrigues: rotates vector v about the unit vector axis by angle (radians)."""
    c, s = math.cos(angle), math.sin(angle)
    dot = sum(a * b for a, b in zip(axis, v))
    cross = (axis[1] * v[2] - axis[2] * v[1],
             axis[2] * v[0] - axis[0] * v[2],
             axis[0] * v[1] - axis[1] * v[0])
    return tuple(v[i] * c + cross[i] * s + axis[i] * dot * (1 - c) for i in range(3))


def attitude(grav):
    """Pitch and roll from gravity, in the recordings' own convention (checked on real takes)."""
    gx, gy, gz = grav
    return math.asin(max(-1.0, min(1.0, -gy))), math.atan2(gx, -gz)


def with_gravity(row, grav):
    g = unit(grav)
    pitch, roll = attitude(g)
    return {**row, "gravX": g[0], "gravY": g[1], "gravZ": g[2], "pitch": pitch, "roll": roll}


def vec(row, prefix):
    return (row[prefix + "X"], row[prefix + "Y"], row[prefix + "Z"])


def set_vec(row, prefix, v):
    return {**row, prefix + "X": v[0], prefix + "Y": v[1], prefix + "Z": v[2]}


def baseline_gravity(rows):
    """Mean gravity over 0.1–1.0 s: the detector's upright reference, skipping the startup glitch."""
    early = [r for r in rows if 0.1 <= r["t"] <= 1.0] or rows[:50]
    return unit(tuple(sum(vec(r, "grav")[i] for r in early) / len(early) for i in range(3)))


# ---------------------------------------------------------------- transforms (each returns new rows)

def mirror(rows):
    """Left-right mirror: flip the lateral axis; rotation is axial, so its other two axes flip."""
    out = []
    for r in rows:
        m = {**r, "accX": -r["accX"], "rotY": -r["rotY"], "rotZ": -r["rotZ"], "yaw": -r["yaw"]}
        out.append(with_gravity(m, (-r["gravX"], r["gravY"], r["gravZ"])))
    return out


def rotate_fit(rows, angle):
    """AirPods sitting differently in the ear: turn the sensor frame about upright gravity."""
    axis = baseline_gravity(rows)
    out = []
    for r in rows:
        m = set_vec(set_vec(r, "acc", rotate(vec(r, "acc"), axis, angle)),
                    "rot", rotate(vec(r, "rot"), axis, angle))
        m = {**m, "yaw": r["yaw"] + angle}
        out.append(with_gravity(m, rotate(vec(r, "grav"), axis, angle)))
    return out


def scale_intensity(rows, acc_k, rot_k):
    return [set_vec(set_vec(r, "acc", tuple(x * acc_k for x in vec(r, "acc"))),
                    "rot", tuple(x * rot_k for x in vec(r, "rot"))) for r in rows]


def event_time(rows):
    """The moment of the action: peak rotation rate."""
    return max(rows, key=lambda r: norm(vec(r, "rot")))["t"]


def stretch_event(rows, k, half_width=EVENT_HALF_WIDTH_S):
    """Makes the action k× longer (k < 1 is faster) without touching the stillness around it.

    Inside the window rotation scales by 1/k and acceleration by 1/k², as for a real
    movement played faster or slower. The take is then resampled to 50 Hz.
    """
    centre = event_time(rows)
    a, b = centre - half_width, centre + half_width

    def warp(t):
        if t < a:
            return t
        if t <= b:
            return a + (t - a) * k
        return a + (b - a) * k + (t - b)

    warped = []
    for r in rows:
        inside = a <= r["t"] <= b
        m = scale_intensity([r], 1 / k ** 2, 1 / k)[0] if inside else r
        warped.append({**m, "t": warp(r["t"])})
    return resample(warped)


def resample(rows):
    """Linear interpolation onto a uniform 50 Hz grid; yaw is unwrapped first."""
    yaws = unwrap([r["yaw"] for r in rows])
    src = [{**r, "yaw": y} for r, y in zip(rows, yaws)]
    out, j, step = [], 0, 1 / RATE_HZ
    n = int((src[-1]["t"] - src[0]["t"]) * RATE_HZ) + 1
    for i in range(n):
        t = src[0]["t"] + i * step
        while j < len(src) - 2 and src[j + 1]["t"] < t:
            j += 1
        lo, hi = src[j], src[j + 1]
        f = 0.0 if hi["t"] == lo["t"] else min(1.0, max(0.0, (t - lo["t"]) / (hi["t"] - lo["t"])))
        r = {c: lo[c] + (hi[c] - lo[c]) * f for c in COLUMNS}
        r = {**r, "t": i * step, "yaw": wrap(r["yaw"])}
        out.append(with_gravity(r, vec(r, "grav")))
    return out


def unwrap(angles):
    out, offset = [angles[0]], 0.0
    for prev, cur in zip(angles, angles[1:]):
        if cur - prev > math.pi:
            offset -= 2 * math.pi
        elif cur - prev < -math.pi:
            offset += 2 * math.pi
        out.append(cur + offset)
    return out


def wrap(angle):
    return (angle + math.pi) % (2 * math.pi) - math.pi


def add_noise(rows, rng):
    out = []
    for r in rows:
        m = set_vec(r, "acc", tuple(x + rng.gauss(0, NOISE_ACC_G) for x in vec(r, "acc")))
        m = set_vec(m, "rot", tuple(x + rng.gauss(0, NOISE_ROT_RAD_S) for x in vec(m, "rot")))
        out.append(with_gravity(m, tuple(x + rng.gauss(0, NOISE_GRAV) for x in vec(r, "grav"))))
    return out


def make_variant(rows, rng):
    """One augmented copy of a real take, and the parameters that made it."""
    params = {
        "mirror": rng.random() < 0.5,
        "fit_deg": rng.uniform(-FIT_ROTATION_DEG, FIT_ROTATION_DEG),
        "acc_scale": rng.uniform(*INTENSITY_RANGE),
        "rot_scale": rng.uniform(*INTENSITY_RANGE),
        "stretch": rng.uniform(*STRETCH_RANGE),
    }
    out = mirror(rows) if params["mirror"] else rows
    out = rotate_fit(out, math.radians(params["fit_deg"]))
    out = scale_intensity(out, params["acc_scale"], params["rot_scale"])
    out = stretch_event(out, params["stretch"])
    return add_noise(out, rng), params


# ---------------------------------------------------------------- synthetic dancing

def bump(t, centre, width):
    return math.exp(-((t - centre) / width) ** 2)


def synthetic_dancing(rng, seconds):
    """A port of SyntheticMotion.dancing (Swift tests): head bobbing on the beat, sway, turns,
    jumps landing at 2.4–3.8 g and the odd head-bang past 50°. These are assumptions about
    dancing, not a recording; they stand in until real dancing takes exist."""
    beat = rng.uniform(120, 132) / 60
    bob, turn_phase = rng.uniform(8, 14), rng.uniform(0, 6)
    jumps, t = [], rng.uniform(2, 5)
    while t < seconds:
        jumps.append((t, rng.uniform(2.4, 3.8), rng.random() < 0.25))
        t += rng.uniform(3, 9)

    def angles(t):
        pitch = bob * math.sin(2 * math.pi * beat * t)
        pitch -= sum(55 * bump(t, jt + 0.1, 0.2) for jt, _, bang in jumps if bang and abs(t - jt) < 1)
        roll = 8 * math.sin(math.pi * beat * t + 1)
        yaw = 25 * math.sin(2 * math.pi * 0.15 * t + turn_phase) + 15 * math.sin(math.pi * beat / 2 * t)
        return [math.radians(x) for x in (pitch, roll, yaw)]

    rows, prev, dt = [], angles(0), 1 / RATE_HZ
    for i in range(int(seconds * RATE_HZ) + 1):
        t = i * dt
        p, r, y = angles(t)
        acc = 0.35 + 0.2 * abs(math.sin(2 * math.pi * beat * t))
        acc += sum(g * bump(t, jt, 0.05) for jt, g, _ in jumps if abs(t - jt) < 0.5)
        grav = (math.cos(p) * math.sin(r), -math.sin(p), -math.cos(p) * math.cos(r))
        row = {"t": t, "pitch": p, "roll": r, "yaw": y,
               "rotX": (p - prev[0]) / dt + rng.gauss(0, 0.15),
               "rotY": (r - prev[1]) / dt + rng.gauss(0, 0.15),
               "rotZ": (y - prev[2]) / dt + rng.gauss(0, 0.15),
               "accX": acc * 0.6 + rng.gauss(0, 0.08), "accY": acc * 0.5 + rng.gauss(0, 0.08),
               "accZ": acc * 0.62 + rng.gauss(0, 0.08),
               "gravX": grav[0], "gravY": grav[1], "gravZ": grav[2]}
        rows.append(row)
        prev = (p, r, y)
    return rows


# ---------------------------------------------------------------- driver

def source_fold(index):
    """Real takes 01–10 → folds 0–4 round robin, so each fold holds one side and one back fall."""
    return (index - 1) % FOLDS


def clear_generated(out_dir):
    """Removes this tool's own earlier output, so a smaller run leaves no stale takes behind."""
    for path in list(out_dir.glob("aug-*.csv")) + list(out_dir.glob("synthetic_*.csv")):
        path.unlink()


def generate(source_dir, out_dir, seed):
    out_dir.mkdir(parents=True, exist_ok=True)
    clear_generated(out_dir)
    manifest = []
    for path in sorted(source_dir.glob("*.csv")):
        meta, rows = read_take(path)
        label, count = meta.get("label", ""), VARIANTS_PER_LABEL.get(meta.get("label", ""), 0)
        take_no = int(path.stem.rsplit("_", 1)[-1])
        for v in range(1, count + 1):
            rng = random.Random(f"{seed}:{path.stem}:{v}")
            variant, params = make_variant(rows, rng)
            name = f"aug-{meta.get('person', 'unknown')}_{label}_{take_no:02d}-{v:02d}.csv"
            write_take(out_dir / name, {**meta, "source": "augmented", "derived_from": path.stem,
                                        "variant": str(v), "fold": str(source_fold(take_no)),
                                        **{k: f"{x:.3f}" if isinstance(x, float) else str(x)
                                           for k, x in params.items()}}, variant)
            manifest.append({"file": name, "label": label, "source": "augmented",
                             "derived_from": path.stem, "fold": source_fold(take_no), **params})
    for i in range(1, SYNTHETIC_DANCING_TAKES + 1):
        rng = random.Random(f"{seed}:dancing:{i}")
        name = f"synthetic_dancing_{i:02d}.csv"
        write_take(out_dir / name, {"label": "dancing", "person": "synthetic", "source": "synthetic",
                                    "derived_from": "SyntheticMotion.dancing",
                                    "fold": str(source_fold(i))},
                   synthetic_dancing(rng, SYNTHETIC_DANCING_SECONDS))
        manifest.append({"file": name, "label": "dancing", "source": "synthetic",
                         "derived_from": "SyntheticMotion.dancing", "fold": source_fold(i)})
    write_manifest(out_dir / "manifest.tsv", manifest)
    return manifest


def write_manifest(path, manifest):
    keys = ["file", "label", "source", "derived_from", "fold",
            "mirror", "fit_deg", "acc_scale", "rot_scale", "stretch"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore", delimiter="\t")
        w.writeheader()
        w.writerows(manifest)


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seed", default="raveguard-1")
    args = parser.parse_args(argv)
    if not args.source.is_dir():
        sys.exit(f"No source folder at {args.source}; run from the repository root.")
    manifest = generate(args.source, args.out, args.seed)
    counts = {}
    for m in manifest:
        counts[m["label"]] = counts.get(m["label"], 0) + 1
    print(f"Wrote {len(manifest)} takes to {args.out}: "
          + ", ".join(f"{n} {label}" for label, n in sorted(counts.items())))


if __name__ == "__main__":
    main(sys.argv[1:])
