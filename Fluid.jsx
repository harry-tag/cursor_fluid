// Fluid.jsx — React wrapper around initFluid().
// Put fluid.js next to this file.
//
//   <Fluid background />                         // fixed full-page background
//   <Fluid palette="lava" style={{height:420}} /> // boxed widget
//
// Props are live: change `palette` or `speed` and the effect updates without remounting.

import { useEffect, useRef } from 'react';
import initFluid from './fluid.js';

export default function Fluid({
  speed = 0.35,
  warp = 3.2,
  force = 0.55,
  palette = 'sage',
  background = false,   // true => fixed, behind content, click-through
  className,
  style,
}){
  const canvasRef = useRef(null);
  const instRef = useRef(null);

  // Initialize once on mount; tear down on unmount.
  useEffect(() => {
    instRef.current = initFluid(canvasRef.current, { speed, warp, force, palette });
    return () => instRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push prop changes into the running instance (no remount, no flicker).
  useEffect(() => {
    instRef.current?.setOptions({ speed, warp, force, palette });
  }, [speed, warp, force, palette]);

  const bgStyle = background
    ? { position: 'fixed', inset: 0, width: '100%', height: '100%',
        zIndex: -1, pointerEvents: 'none' }
    : { width: '100%', height: '100%', display: 'block' };

  return <canvas ref={canvasRef} className={className} style={{ ...bgStyle, ...style }} />;
}
