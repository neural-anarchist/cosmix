import { RockingDiagram } from "./RockingDiagram";
import { THEORY_CONTENT, THEORY_INTRO } from "./content";
import { MathText } from "../math/Katex";

export function TheorySection() {
  return (
    <div className="panel-grid theory-layout">
      <div className="prose">
        <p>
          <MathText text={THEORY_INTRO} />
        </p>
        {THEORY_CONTENT.map((section) => (
          <div key={section.heading}>
            <h3>{section.heading}</h3>
            {section.paragraphs.map((p, i) =>
              p.variant ? (
                <p className={p.variant} key={i}>
                  <MathText text={p.text} />
                </p>
              ) : (
                <p key={i}>
                  <MathText text={p.text} />
                </p>
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
