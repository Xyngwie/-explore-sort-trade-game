# Cover movement integration note

The cover movement helper sets `unit.moveTarget` to the selected cover center while the unit is in the attraction zone. The normal movement loop must call `updateCoverMovement` before applying movement input/target movement.

This change intentionally does not alter damage/block calculations, cover placement, or wingman formation behavior.
