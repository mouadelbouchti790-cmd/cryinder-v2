/**
 * BrandMark — single source of truth for the Cryinder app logo.
 *
 * To swap the brand mark app-wide, replace `public/logo.png`
 * (and `public/favicon.png` for the browser tab) with the new artwork.
 * Every in-app logo renders through this component.
 */
export const BRAND_LOGO_SRC = '/logo.png';

interface BrandMarkProps {
  className?: string;
  alt?: string;
}

export default function BrandMark({ className = 'h-7 w-7 rounded-lg object-contain', alt = 'Cryinder' }: BrandMarkProps) {
  return <img src={BRAND_LOGO_SRC} alt={alt} className={className} draggable={false} />;
}
