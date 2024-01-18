export function checkCircleCollision(
	x1: number,
	y1: number,
	r1: number,
	x2: number,
	y2: number,
	r2: number
): boolean {
	return Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2)) <= r1 + r2;
}
