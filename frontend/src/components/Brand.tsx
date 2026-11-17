import { Wheat } from "lucide-react";
import { navigate, pagePaths } from "../lib/navigation";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <a
      className={`brand ${light ? "brand-light" : ""}`}
      href={pagePaths.overview}
      aria-label="Where the Bread At — Overview"
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        navigate("overview");
      }}
    >
      <span className="brand-mark">
        <Wheat size={25} strokeWidth={1.7} />
      </span>
      <span>
        where the
        <br />
        <strong>bread at.</strong>
      </span>
    </a>
  );
}
