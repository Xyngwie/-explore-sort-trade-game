import {bootPlayLog,mountFullscreenShell} from '@estg/shared';
void bootPlayLog(()=>{mountFullscreenShell('restore');return import('./main');});
