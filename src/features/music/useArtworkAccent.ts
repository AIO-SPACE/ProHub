import { useEffect, useState } from 'react';

const fallback = { accent: '#ff6b57', soft: 'rgba(255, 107, 87, 0.18)' };

export function useArtworkAccent(artwork?: string | null) {
  const [colors, setColors] = useState(fallback);

  useEffect(() => {
    if (!artwork) return;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 24;
      canvas.height = 24;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, 24, 24);
      const pixels = context.getImageData(0, 0, 24, 24).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;
      for (let index = 0; index < pixels.length; index += 16) {
        const brightness = pixels[index] + pixels[index + 1] + pixels[index + 2];
        if (brightness < 90 || brightness > 700) continue;
        red += pixels[index];
        green += pixels[index + 1];
        blue += pixels[index + 2];
        count += 1;
      }
      if (!count) return;
      const r = Math.round(red / count);
      const g = Math.round(green / count);
      const b = Math.round(blue / count);
      setColors({ accent: `rgb(${r} ${g} ${b})`, soft: `rgba(${r}, ${g}, ${b}, 0.2)` });
    };
    image.onerror = () => setColors(fallback);
    image.src = artwork;
  }, [artwork]);

  return artwork ? colors : fallback;
}
