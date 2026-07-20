import { Vec3 } from 'cc';

/** Samples a Catmull-Rom spline while preserving the source node order. */
export function sampleCatmullRom(points: readonly Vec3[], samplesPerSegment: number, closed: boolean): Vec3[] {
    if (points.length < 2) {
        return points.map(point => point.clone());
    }

    const samples = Math.max(1, Math.floor(samplesPerSegment));
    const result: Vec3[] = [];
    const segmentCount = closed ? points.length : points.length - 1;
    const pointAt = (index: number): Vec3 => {
        if (closed) {
            const wrapped = (index % points.length + points.length) % points.length;
            return points[wrapped];
        }
        return points[Math.max(0, Math.min(points.length - 1, index))];
    };

    for (let segment = 0; segment < segmentCount; segment++) {
        const p0 = pointAt(segment - 1);
        const p1 = pointAt(segment);
        const p2 = pointAt(segment + 1);
        const p3 = pointAt(segment + 2);

        for (let step = 0; step < samples; step++) {
            const t = step / samples;
            const t2 = t * t;
            const t3 = t2 * t;
            result.push(new Vec3(
                0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t
                    + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
                    + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t
                    + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
                    + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
                0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t
                    + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2
                    + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
            ));
        }
    }

    result.push((closed ? points[0] : points[points.length - 1]).clone());
    return result;
}

export function distanceToSegmentSquared(
    x: number,
    y: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
): number {
    const abx = bx - ax;
    const aby = by - ay;
    const lengthSquared = abx * abx + aby * aby;
    if (lengthSquared <= 0.000001) {
        const dx = x - ax;
        const dy = y - ay;
        return dx * dx + dy * dy;
    }

    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / lengthSquared));
    const dx = x - (ax + abx * t);
    const dy = y - (ay + aby * t);
    return dx * dx + dy * dy;
}
