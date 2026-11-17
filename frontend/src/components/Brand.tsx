import { Wheat } from "lucide-react";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? "brand-light" : ""}`}>
      <span className="brand-mark">
        <Wheat size={25} strokeWidth={1.7} />
      </span>
      <span>
        where the
        <br />
        <strong>bread at.</strong>
      </span>
    </div>
  );
}
