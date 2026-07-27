import { useEffect, useState } from "react";
import type { Transfer } from "../lib/types";
import "./TransferBento.css";

interface Props {
  clubId: string;
  transfers: Transfer[];
}

// Reads transfers straight from the already-loaded club JSON (baked in at
// pipeline time). No fetch, no independent failure mode. If the optional
// freshness Function is deployed (VITE_ENABLE_TRANSFER_REFRESH=true), this also
// consults /api/transfers/:clubId as a SILENT refresh: static data renders
// first and any fetch failure is swallowed, so transfers can never break the page.
export default function TransferBento({ clubId, transfers: staticTransfers }: Props) {
  const [transfers, setTransfers] = useState<Transfer[]>(staticTransfers);

  useEffect(() => {
    setTransfers(staticTransfers);
    if (import.meta.env.VITE_ENABLE_TRANSFER_REFRESH !== "true") return;
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}api/transfers/${clubId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.transfers) && data.transfers.length) {
          setTransfers(data.transfers);
        }
      })
      .catch(() => {
        /* silent: the static data already rendered */
      });
    return () => {
      cancelled = true;
    };
  }, [clubId, staticTransfers]);

  return (
    <section className="tb panel">
      <div className="tb__head">
        <div className="eyebrow">Recent transfers</div>
        <p className="tb__src">Confirmed transfers from API-Football, captured at data-refresh time. Not a live rumour feed.</p>
      </div>

      {transfers.length === 0 ? (
        <div className="tb__empty">No recent transfers on record.</div>
      ) : (
        <div className="tb__grid">
          {transfers.map((t, i) => (
            <article key={i} className={`tb__cell lift ${t.direction === "in" ? "is-in" : "is-out"}`}>
              <div className="tb__dir">
                <span className="tb__arrow">{t.direction === "in" ? "↓ IN" : "↑ OUT"}</span>
                {t.fee && <span className="tb__fee mono">{t.fee}</span>}
              </div>
              <div className="tb__player display">{t.player}</div>
              <div className="tb__club">{t.direction === "in" ? "from " : "to "}{t.otherClub}</div>
              {t.date && <div className="tb__date mono">{t.date}</div>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
