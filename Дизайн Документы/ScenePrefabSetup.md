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

Для полей, которые MCP-сервер не умеет сериализовать как пустые массивы, используются фиксированные явные Inspector-ссылки (`queuePoint1..4`, `exitPoint1..3`, `finalVisualShop1..3`). Руда создаётся отдельным seed-based генератором.

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
  - `movementCollider = Player/CapsuleCollider`
  - движение проверяется тремя raycast по ширине капсулы и скользит вдоль обычных collider, не учитывая trigger-зоны
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
  - `playerFacingRoot = Orc`, чтобы головка пылесоса повторяла направление персонажа
  - `tubePartPrefab`
  - `tubePartsRoot`
  - `normalTubeMaterial`
  - `warningTubeMaterial`
  - длины для upgrade 0/1/2

## Fence collision

- Исходный `BoxCollider 20 x 1 x 20` на `FencePerimeter` отключён как физическое тело: он является сплошным объёмом, а не рамкой.
- `FenceCollisionRoot` содержит статические не-trigger `BoxCollider` по сторонам периметра и сохраняет проход к песку.

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
  - ссылка `oreBuilder` на `SandOreAreaBuilder`
  - при выходе последнего collider игрока восстанавливает поверхность и руду, отключает пылесос и его анимацию
- `SandEntryInteractor` расположен отдельно перед полем:
  - при входе `GameFlowController` выдаёт пылесос, отключает joystick-управление и запускает игрока к `SandRunTarget`;
  - после достижения `SandRunTarget` управление возвращается;
  - большой collider песка не является игровым interactor и используется только `SandField`.
- При полном выходе из collider песка `SandField` восстанавливает поле и отправляет головку пылесоса обратно в `TubeHeadHomePivot`.

На руде:

- `SandCollectableOre`
  - `flyVisualPrefab`
  - `resultItem = GoldOre`
  - `collectRadius`
- `SandOreAreaBuilder`
  - использует границы `Sand/BoxCollider`;
  - `oreCount = 10`, `minimumDistance = 1.6`, `edgePadding = 1.1`;
  - `seed` задаёт воспроизводимую случайную раскладку аналогично `ForestAreaBuilder`;
  - случайные поворот и scale `0.08..0.13`.

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
