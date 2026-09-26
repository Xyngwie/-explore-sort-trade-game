# Cover movement integration smoke test

The leader movement loop calls `updateCoverMovement()` before `moveToward()`. Entering the attraction radius redirects the leader target to the cover center; outward input clears cover state and starts the escape grace period.
