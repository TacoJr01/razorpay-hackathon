import { DOT_GRID, DOT_GRID_WIDTH, DOT_GRID_HEIGHT } from './dot-grid';

/**
 * Shared background used everywhere the site wants the landing page's look:
 * an evenly-spaced dot grid, rotated, each dot flickering independently on
 * its own fixed position (see dot-grid.ts). The dotFlicker keyframes live in
 * globals.css so this works on any page without duplicating the animation.
 */
export function DotBackground() {
  return (
    <div
      className="absolute"
      style={{
        left: '50%',
        top: '50%',
        width: DOT_GRID_WIDTH,
        height: DOT_GRID_HEIGHT,
        transform: 'translate(-50%, -50%) rotate(15deg)',
      }}
    >
      <svg width={DOT_GRID_WIDTH} height={DOT_GRID_HEIGHT} viewBox={`0 0 ${DOT_GRID_WIDTH} ${DOT_GRID_HEIGHT}`}>
        {DOT_GRID.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={1.6}
            fill="white"
            style={{ animation: `dotFlicker ${d.duration}s ease-in-out ${d.delay}s infinite` }}
          />
        ))}
      </svg>
    </div>
  );
}
