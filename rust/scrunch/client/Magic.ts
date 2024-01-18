/* Math */
// Unity lib: https://github.com/MattRix/UnityDecompiled/blob/753fde37d331b2100f93cc5f9eb343f1dcff5eee/UnityEngine/UnityEngine/Mathf.cs
declare global {
    interface Math {
        mod(n: number, m: number): number;
        lerp(a: number, b: number, t: number): number;
        // smoothDamp(current: number, target: number, currentVelocity: number, smoothTime: number, deltaTime: number, maxSpeed: number): [number, number]; // Returns new value, velocity
        slerp(a: number, b: number, t: number): number;
        repeat(t: number, length: number): number;
        clamp01(t: number): number;
        clamp(t: number, a: number, b: number): number;
        sinInterpolate(t: number): number;
        angleDifference(a: number, b: number): number;
    }
}

Math.mod = function(n: number, m: number): number {
    let remain = n % m;
    return Math.floor(remain >= 0 ? remain : remain + m);
};

Math.lerp = function(a: number, b: number, t: number): number {
    return (b - a) * t + a;
};

// Math.slerp = function(a: number, b: number, t: number): number {
//     let cs = (1 - t) * Math.cos(a) + t * Math.cos(b);
//     let sn = (1 - t) * Math.sin(a) + t * Math.sin(b);
//     return Math.atan2(sn, cs);
// };

Math.slerp = function(a: number, b: number, t: number): number {
    let num = Math.repeat(b - a, Math.PI * 2);
    if (num > Math.PI) {
        num -= Math.PI * 2;
    }
    return a + num * Math.clamp01(t);
};

// A fixed mod
Math.repeat = function(t: number, length: number) {
    return t - Math.floor(t / length) * length;
};

Math.clamp01 = function(t: number) {
    if (t < 0)
        return 0;
    else if (t > 1)
        return 1;
    else
        return t;
}

Math.clamp = function(t: number, a: number, b: number) {
    if (t < a)
        return a;
    else if (t > b)
        return b;
    else
        return t;
}

// Math.smoothDamp = function(current: number, target: number, currentVelocity: number, smoothTime: number, deltaTime: number, maxSpeed: number = Infinity): [number, number] {
//     smoothTime = Math.max(0.0001, smoothTime);
//     let num = 2 / smoothTime;
//     let num2 = num * deltaTime;
//     let num3 = 1 / (1 + num2 + 0.48 * num2 * num2 + 0.235 * num2 * num2 * num2);
//     let num4 = current - target;
//     let num5 = target;
//     let num6 = maxSpeed * smoothTime;
//     num4 = THREE.Math.clamp(num4, -num6, num6);
//     target = current - num4;
//     let num7 = (currentVelocity + num * num4) * deltaTime;
//     currentVelocity = (currentVelocity - num * num7) * num3;
//     let num8 = target + (num4 + num7) * num3;
//     if (num5 - current > 0 == num8 > num5)  {
//         num8 = num5;
//         currentVelocity = (num8 - num5) / deltaTime;
//     }
//     return [num8, currentVelocity];
// };

Math.sinInterpolate = function(time: number): number {
    return (Math.sin(Math.PI * (time - 1 / 2)) + 1) / 2;
};

Math.angleDifference = function(a: number, b: number): number {
    const rotation = Math.repeat(a, Math.PI * 2);
    let dirDiff = b - a;
    dirDiff = Math.repeat(dirDiff + Math.PI, Math.PI * 2) - Math.PI;

    return dirDiff;
}

// Force this module to export something
export default undefined;
