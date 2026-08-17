import { useEffect, useRef } from "react";
import { RockingDiagram } from "./RockingDiagram";
import { THEORY_CONTENT, THEORY_INTRO } from "./content";
import { renderMathIn } from "./renderMath";

export function TheorySection() {
  const proseRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    renderMathIn(proseRef.current);
  }, []);

  return (
    <div className="panel-grid theory-layout">
      <div className="prose" ref={proseRef}>
        <p>{THEORY_INTRO}</p>
        {THEORY_CONTENT.map((section) => (
          <div key={section.heading}>
            <h3>{section.heading}</h3>
            {section.paragraphs.map((p, i) =>
              p.variant ? (
                <p className={p.variant} key={i}>
                  {p.text}
                </p>
              ) : (
                <p key={i}>{p.text}</p>
              )
            )}
          </div>
        ))}
      </div>

      <div className="panel panel-sticky">
        <h3>Live rocking geometry</h3>
        <RockingDiagram />
      </div>
    </div>
  );
}
