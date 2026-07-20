# Ground Path Baker

Инструмент создаёт тропинки из точек редактора и запекает их вместе с вариацией
глиняного пола в одну RGB-текстуру.

После первой установки расширения перезапустите Cocos Creator, чтобы появилось
верхнее меню `Ground Paths`.

## Использование

1. Выберите `Floor` с компонентом `MeshRenderer`.
2. В верхнем меню выберите `Ground Paths -> Setup Selected Floor`.
3. Раскройте `GroundPaths/Path_01` и перемещайте `Point_*` в плоскости XZ.
4. Настройте `width`, `edgeFeather` и `edgeNoise` на компоненте `GroundPath`.
5. Выберите `Floor`, путь или любую его точку и выполните
   `Ground Paths -> Bake Selected Floor`.
6. Сохраните сцену.

Дополнительные команды:

- `Add Path` создаёт ещё один независимый путь;
- `Add Point` продолжает выбранный путь новой точкой;
- повторный Bake перезаписывает `assets/Generated/Ground_Baked.png`, сохраняя UUID.

`GroundPath` создаёт только редакторский preview-меш. В билде его renderer и
component отключаются. Финальный `Floor` использует один непрозрачный материал,
одну RGB-текстуру и один texture sample.
