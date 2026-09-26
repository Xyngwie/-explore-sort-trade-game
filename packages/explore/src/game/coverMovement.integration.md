# Cover movement integration

Cover entry is object-based: when the leader enters a cover object's interaction radius while moving inward, the unit snaps to the cover center and becomes `inCover`.

Cover exit remains input-driven: outward movement clears `inCover` and grants a short re-entry grace period.

The old global V/button cover toggle is guarded at the UI layer in PR #120 so cover cannot be enabled in open ground.
