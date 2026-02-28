import React, { useEffect } from 'react'
import './ParticleBackground.css'

interface ParticleBackgroundProps {
  /**
   * Element id used by particleground to attach canvas. If omitted an auto-generated
   * id will be created. You can still provide your own value (e.g. for testing).
   */
  id?: string;
  /**
   * When true the particle layer is treated as a background (slower,
   * translucent dots and a gradient) otherwise it is a foreground layer with
   * faster/denser particles and no gradient. Defaults to `true`.
   */
  isBackground?: boolean;
  /**
   * Additional classes are appended to the outer div (useful for theming or
   * positioning overrides).
   */
  className?: string;
}

const ParticleBackground: React.FC<ParticleBackgroundProps> = ({
  id,
  isBackground = true,
  className = ''
}) => {
  // generate an id if none was provided; particleground requires an element
  // reference but we don't care about the actual value.
  const elementId = React.useMemo(
    () => id || `particles-${Math.random().toString(36).substr(2, 9)}`,
    [id]
  )

  useEffect(() => {
    // Ensure particleground script is loaded
    const loadParticleground = () => {
      if (typeof (window as any).particleground !== 'undefined') {
        const element = document.getElementById(elementId)
        if (element) {
          const config = isBackground
            ? {
                dotColor: 'rgba(255, 255, 255, 0.5)',
                lineColor: 'rgba(255, 255, 255, 0.05)',
                minSpeedX: 0.075,
                maxSpeedX: 0.15,
                minSpeedY: 0.075,
                maxSpeedY: 0.15,
                density: 30000,
                curvedLines: false,
                proximity: 20,
                parallaxMultiplier: 20,
                particleRadius: 2,
              }
            : {
                dotColor: 'rgba(255, 255, 255, 1)',
                lineColor: 'rgba(255, 255, 255, 0.05)',
                minSpeedX: 0.3,
                maxSpeedX: 0.6,
                minSpeedY: 0.3,
                maxSpeedY: 0.6,
                density: 50000,
                curvedLines: false,
                proximity: 250,
                parallaxMultiplier: 10,
                particleRadius: 4,
              };
          (window as any).particleground(element, config)
        }
      }
    }

    const script = document.createElement('script')
    script.src = '/particleground.js'
    script.onload = loadParticleground
    script.async = true
    document.body.appendChild(script)

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
    }
  }, [elementId, isBackground])

  const layerClass = isBackground ? 'background' : 'foreground'

  return (
    <div
      id={elementId}
      className={`particle-container ${layerClass} ${className}`.trim()}
    />
  )
}

export default ParticleBackground
