import {bootPlayLog} from '@estg/shared';
void bootPlayLog(async()=>{
 await import('./main');
 await import('./hubContainerBridge');
 await import('./sort-handoff-guard');
});
