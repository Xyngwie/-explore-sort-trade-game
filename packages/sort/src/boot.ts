import {bootPlayLog,mountFullscreenShell} from '@estg/shared';
void bootPlayLog(async()=>{
 mountFullscreenShell('sort');
 await import('./main');
 await import('./hubContainerBridge');
 await import('./sort-handoff-guard');
});
