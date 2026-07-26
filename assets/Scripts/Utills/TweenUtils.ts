import { Quat, Vec3 } from "cc";
import { tween, Node } from "cc";


export class TweenUtils {
    public static FlyTween(nodeToFly: Node, endWorldPosition: Vec3, FinishCallback: CallableFunction, time: number = 0.15) {
        tween(nodeToFly)
            .to(time, { worldPosition: endWorldPosition })
            .call(() => { FinishCallback() })
            .start();
    }
    public static async FlyTweenWithMidlePoint(nodeToFly: Node, yPoint: number, endWorldPosition: Vec3, FinishCallback: CallableFunction, time: number = 0.15) {
        if (!nodeToFly) {
            return;
        }

        const startPosition = new Vec3();
        nodeToFly.getWorldPosition(startPosition);

        const targetPosition = endWorldPosition.clone();
        const controlPosition = new Vec3(
            (startPosition.x + targetPosition.x) * 0.5,
            (startPosition.y + targetPosition.y) * 0.5 + yPoint,
            (startPosition.z + targetPosition.z) * 0.5
        );
        const bezierPoint = new Vec3();

        const clampTime = Math.max(0, time);

        if (clampTime === 0) {
            nodeToFly.setWorldPosition(targetPosition);
            FinishCallback && FinishCallback();
            return;
        }

        await new Promise<void>((resolve) => {
            tween({ t: 0 })
                .to(clampTime, { t: 1 }, {
                    onUpdate: (obj) => {
                        const t = obj.t;
                        const oneMinusT = 1 - t;

                        bezierPoint.set(
                            oneMinusT * oneMinusT * startPosition.x + 2 * oneMinusT * t * controlPosition.x + t * t * targetPosition.x,
                            oneMinusT * oneMinusT * startPosition.y + 2 * oneMinusT * t * controlPosition.y + t * t * targetPosition.y,
                            oneMinusT * oneMinusT * startPosition.z + 2 * oneMinusT * t * controlPosition.z + t * t * targetPosition.z
                        );

                        nodeToFly.setWorldPosition(bezierPoint);
                    }
                })
                .call(() => {
                    FinishCallback && FinishCallback();
                    resolve();
                })
                .start();
        });
    }

    public static async FlyTweenWithMidlePointAndScale(nodeToFly: Node, addVec: Vec3, endWorldPosition: Vec3, targetScale: number, FinishCallback: CallableFunction, time: number = 0.15) {
        if (!nodeToFly) {
            return;
        }

        const startPosition = new Vec3();
        nodeToFly.getWorldPosition(startPosition);

        const targetPosition = endWorldPosition.clone();
        const controlPosition = new Vec3(
            (startPosition.x + targetPosition.x) * 0.5 + addVec.x,
            (startPosition.y + targetPosition.y) * 0.5 + addVec.y,
            (startPosition.z + targetPosition.z) * 0.5 + addVec.z
        );
        const bezierPoint = new Vec3();

        const clampTime = Math.max(0, time);

        if (clampTime === 0) {
            nodeToFly.setWorldPosition(targetPosition);
            FinishCallback && FinishCallback();
            return;
        }

        const startScale = nodeToFly.scale.x; // Предполагаем равномерный скейл
        const scaleDiff = targetScale - startScale;

        // Easing функция для плавного ускорения и замедления (ease-in-out-cubic)
        const easeInOutCubic = (t: number): number => {
            return t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2;
        };

        // Функция для вычисления скейла: максимальный в середине (t=0.5), исходный в начале и конце
        const getScale = (t: number): number => {
            if (t <= 0.5) {
                // От startScale до targetScale (0 -> 0.5)
                const normalizedT = t * 2; // 0 -> 1
                return startScale + scaleDiff * normalizedT;
            } else {
                // От targetScale до startScale (0.5 -> 1)
                const normalizedT = (t - 0.5) * 2; // 0 -> 1
                return targetScale - scaleDiff * normalizedT;
            }
        };

        await new Promise<void>((resolve) => {
            tween({ t: 0 })
                .to(clampTime, { t: 1 }, {
                    // easing: 'sineInOut', // Используем встроенный easing для плавной скорости
                    onUpdate: (obj) => {
                        const rawT = obj.t;
                        // Применяем дополнительный easing для более плавного движения
                        const easedT = easeInOutCubic(rawT);
                        const oneMinusT = 1 - easedT;

                        // Вычисляем позицию по кривой Безье с применённым easing
                        bezierPoint.set(
                            oneMinusT * oneMinusT * startPosition.x + 2 * oneMinusT * easedT * controlPosition.x + easedT * easedT * targetPosition.x,
                            oneMinusT * oneMinusT * startPosition.y + 2 * oneMinusT * easedT * controlPosition.y + easedT * easedT * targetPosition.y,
                            oneMinusT * oneMinusT * startPosition.z + 2 * oneMinusT * easedT * controlPosition.z + easedT * easedT * targetPosition.z
                        );

                        nodeToFly.setWorldPosition(bezierPoint);

                        // Применяем скейл: максимальный в середине
                        const currentScale = getScale(rawT);
                        nodeToFly.setScale(currentScale, currentScale, currentScale);
                    }
                })
                .call(() => {
                    // Убеждаемся, что скейл вернулся к исходному
                    nodeToFly.setScale(startScale, startScale, startScale);
                    FinishCallback && FinishCallback();
                    resolve();
                })
                .start();
        });
    }

    public static async FlyTweenWithMidlePointAndScaleToNode(
        nodeToFly: Node,
        addVec: Vec3,
        targetNode: Node,
        targetScale: number,
        FinishCallback: CallableFunction,
        time: number = 0.15,
        matchTargetWorldTransform: boolean = false,
    ) {
        if (!nodeToFly || !targetNode) {
            return;
        }

        const startWorldScale = nodeToFly.getWorldScale().clone();
        const currentTargetWorldScale = new Vec3();
        const currentWorldScale = new Vec3();
        const startWorldRotation = nodeToFly.getWorldRotation().clone();
        const currentTargetWorldRotation = new Quat();
        const currentWorldRotation = new Quat();

        const startPosition = new Vec3();
        nodeToFly.getWorldPosition(startPosition);

        const targetPosition = new Vec3();
        targetNode.getWorldPosition(targetPosition);

        const bezierPoint = new Vec3();
        const currentTargetPosition = new Vec3();
        const currentControlPosition = new Vec3();

        const clampTime = Math.max(0, time);

        if (clampTime === 0) {
            targetNode.getWorldPosition(currentTargetPosition);
            nodeToFly.setWorldPosition(currentTargetPosition);
            if (matchTargetWorldTransform) {
                nodeToFly.setWorldScale(targetNode.getWorldScale());
                nodeToFly.setWorldRotation(targetNode.getWorldRotation());
            }
            FinishCallback && FinishCallback();
            return;
        }

        const startScale = nodeToFly.scale.x; // Предполагаем равномерный скейл
        const scaleDiff = targetScale - startScale;

        // Easing функция для плавного ускорения и замедления (ease-in-out-cubic)
        const easeInOutCubic = (t: number): number => {
            return t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2;
        };

        // Функция для вычисления скейла: максимальный в середине (t=0.5), исходный в начале и конце
        const getScale = (t: number): number => {
            if (t <= 0.5) {
                // От startScale до targetScale (0 -> 0.5)
                const normalizedT = t * 2; // 0 -> 1
                return startScale + scaleDiff * normalizedT;
            } else {
                // От targetScale до startScale (0.5 -> 1)
                const normalizedT = (t - 0.5) * 2; // 0 -> 1
                return targetScale - scaleDiff * normalizedT;
            }
        };

        await new Promise<void>((resolve) => {
            tween({ t: 0 })
                .to(clampTime, { t: 1 }, {
                    onUpdate: (obj) => {
                        const rawT = obj.t;
                        // Применяем дополнительный easing для более плавного движения
                        const easedT = easeInOutCubic(rawT);
                        const oneMinusT = 1 - easedT;

                        // Получаем текущую позицию целевой ноды (на случай, если она движется)
                        targetNode.getWorldPosition(currentTargetPosition);

                        // Пересчитываем контрольную точку на основе текущей позиции цели
                        currentControlPosition.set(
                            (startPosition.x + currentTargetPosition.x) * 0.5 + addVec.x,
                            (startPosition.y + currentTargetPosition.y) * 0.5 + addVec.y,
                            (startPosition.z + currentTargetPosition.z) * 0.5 + addVec.z
                        );

                        // Вычисляем позицию по кривой Безье с применённым easing
                        bezierPoint.set(
                            oneMinusT * oneMinusT * startPosition.x + 2 * oneMinusT * easedT * currentControlPosition.x + easedT * easedT * currentTargetPosition.x,
                            oneMinusT * oneMinusT * startPosition.y + 2 * oneMinusT * easedT * currentControlPosition.y + easedT * easedT * currentTargetPosition.y,
                            oneMinusT * oneMinusT * startPosition.z + 2 * oneMinusT * easedT * currentControlPosition.z + easedT * easedT * currentTargetPosition.z
                        );

                        nodeToFly.setWorldPosition(bezierPoint);

                        // Применяем скейл: максимальный в середине
                        if (matchTargetWorldTransform) {
                            targetNode.getWorldScale(currentTargetWorldScale);
                            Vec3.lerp(currentWorldScale, startWorldScale, currentTargetWorldScale, easedT);
                            nodeToFly.setWorldScale(currentWorldScale);

                            targetNode.getWorldRotation(currentTargetWorldRotation);
                            Quat.slerp(currentWorldRotation, startWorldRotation, currentTargetWorldRotation, easedT);
                            nodeToFly.setWorldRotation(currentWorldRotation);
                        } else {
                            const currentScale = getScale(rawT);
                            nodeToFly.setScale(currentScale, currentScale, currentScale);
                        }
                    }
                })
                .call(() => {
                    // Убеждаемся, что скейл вернулся к исходному
                    if (matchTargetWorldTransform) {
                        nodeToFly.setWorldScale(targetNode.getWorldScale());
                        nodeToFly.setWorldRotation(targetNode.getWorldRotation());
                    } else {
                        nodeToFly.setScale(startScale, startScale, startScale);
                    }
                    FinishCallback && FinishCallback();
                    resolve();
                })
                .start();
        });
    }
}
