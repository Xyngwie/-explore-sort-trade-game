import type { Vec2 } from "./math";
/** First contact along a finite segment, including fast shots and starting inside. */
export function segmentCircle(a: Vec2, b: Vec2, center: Vec2, radius: number): number | null {
  const x=a.x-center.x, y=a.y-center.y, dx=b.x-a.x, dy=b.y-a.y;
  const c=x*x+y*y-radius*radius;
  if(c < -1e-7) return 0;
  const aa=dx*dx+dy*dy;
  if(aa<1e-12) return c<=0 ? 0 : null;
  const bb=x*dx+y*dy;
  if(c<=1e-7 && bb>=0) return null; // leaving / sliding along the boundary
  const disc=bb*bb-aa*c;
  if(disc<0) return null;
  const t=(-bb-Math.sqrt(disc))/aa;
  return t>=0 && t<=1 ? t : null;
}
