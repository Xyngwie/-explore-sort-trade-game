import {bootPlayLog,mountFullscreenShell} from '@estg/shared';
void bootPlayLog(async()=>{
 mountFullscreenShell('trade');
 await import('./sort-handoff-gate');
 await import('./wallet-summary');
 await import('./unopened-sort-back-guard');
 await import('./circuit-equip-ui');
 await import('./main');
});
