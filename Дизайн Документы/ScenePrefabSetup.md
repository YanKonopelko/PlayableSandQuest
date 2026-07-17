# Scene / Prefab setup checklist

Этот файл нужен для ручной проверки сцены после добавления компонентов. Все пункты должны быть выставлены в Cocos Creator Inspector.

## Статус настройки — 2026-07-17

Сцена `assets/Scenes/scene.scene` настроена через Cocos MCP. Обязательные ссылки прошли автоматический аудит: 89 из 89 заполнены.

Созданы gameplay-prefabs:

- `TubePart.prefab`
- `MoneyItem.prefab`
- `CartUnit.prefab`
- `GameplayInteractor.prefab`
- `GameplayStorage.prefab`
- `GameplayShop.prefab`

Для полей, которые MCP-сервер не умеет сериализовать как пустые массивы, используются фиксированные явные Inspector-ссылки (`queuePoint1..4`, `exitPoint1..3`, `ore1..4`, `finalVisualShop1..3`). Это сохраняет принцип отсутствия runtime fallback.

## Scene roots

- `GameplayRoot`
  - `GameFlowController`
  - ссылки на игрока, камеру, подсказки, песок, обменник, хранилище, магазины, очередь телег, packshot.
- `Level`
  - `SandSide`
  - `OrcsSide`
  - route points для телег.
- `Canvas`
  - `Joystick`
  - packshot UI.

## Player

На игроке:

- `PlayerController`
  - `joystick`
  - `vacuumSystem`
  - `movementRoot` или сама node
  - `moveSpeed`
  - `rotationLerp`
- `PlayerInventory`
  - stack roots для `GoldOre`, `Ingot`, `Money`.
- `PlayerAnimationController`
  - animation/animator ссылка
  - имена клипов/параметров idle, walk, vacuum hold.

Обязательные child/pivot:

- `HandsPivot`
- `BackStackRoot`
- `VacuumHeadHoldPivot`

## Camera

На `Main Camera`:

- `AdaptiveCameraFollower`
  - `target = Player`
  - portrait/landscape offsets
  - follow smoothing

## Joystick

На UI root джойстика:

- `FloatingJoystick`
  - base node
  - handle node
  - canvas transform
  - max radius

## Interactors

Каждый interactor:

- `BoxCollider` с `isTrigger = true`
- `Interactor`
  - тип игрока задаётся через playerRoot/playerTag по сцене

## Storage

На хранилище:

- `StorageInteractor`
  - `acceptedItem`
  - `capacity`
  - `stackView`
  - `receivePivot`

## Shop

На магазине:

- `ShopInteractor`
  - `priceItem`
  - `price`
  - `progressRoot/fill`
  - `receivePivot`
  - callback в `GameFlowController`

## Vacuum

На root пылесоса:

- `VacuumSystem`
  - `tubeHead`
  - `tubeHeadHomePivot`
  - `machinePivot`
  - `playerHandPivot`
  - `tubePartPrefab`
  - `tubePartsRoot`
  - `normalTubeMaterial`
  - `warningTubeMaterial`
  - длины для upgrade 0/1/2

## Sand

На поле песка:

- `BoxCollider`
  - размер `20 x 1 x 20`
  - `isTrigger = true`
- `SandVolumeSurface`
  - создаёт цельный объёмный mesh точно по границам `BoxCollider`
  - непрерывно вычитает сферическую выемку вокруг `VacuumProbe`, без клеточной маски и исчезающих блоков
  - шаг геометрии `0.2`, многочастотный рельеф и пересчитываемые нормали
  - глобальные UV с повторяющейся текстурой грунта вместо плоской одноцветной заливки
  - `SandVolume.mtl`
- `SandField`
  - `vacuumProbe`
  - явные ссылки `ore1..4`
  - при выходе последнего collider игрока восстанавливает поверхность и руду, отключает пылесос и его анимацию
- `Interactor` и `HintTarget` используют тот же trigger-поле и переданы в `GameFlowController`.

На руде:

- `SandCollectableOre`
  - `flyVisualPrefab`
  - `resultItem = GoldOre`
  - `collectRadius`

## Cart queue

На root очереди:

- `CartQueueController`
  - `cartUnitPrefab`
  - `queuePoints`
  - `exitRoutePoints`
  - `activeExchangePivot`
  - `goldPerCart = 4`

На prefab телеги:

- `CartUnit`
  - `cartFillRoot`
  - `receivePivot`
  - `moveSpeed`

## Hints

На `HintController`:

- `arrow2d`
- `arrow3d`
- `camera`
- `canvas`
- target offsets

Каждая цель подсказки:

- `HintTarget`
  - `targetPivot`
  - `priority`

## Packshot

На packshot root:

- `PackshotController`
  - hidden by default
  - CTA button вызывает `GameplayScene.ToStore()`
