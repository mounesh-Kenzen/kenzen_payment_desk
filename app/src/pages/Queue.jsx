import React from "react";
import { useStore } from "../lib/store.jsx";
import { useDrawer } from "../lib/drawer.jsx";
import RequestTable, { EmptyBox } from "../components/RequestTable.jsx";
import { myAction, roleIds, money0, balanceLeft } from "../../shared/logic.js";
import { useNavigate } from "react-router-dom";

const GROUPS = [
  ["approve", "To approve", "Requests at your approval level that someone else raised. Check the “Can be paid?” column before approving."],
  ["pay", "To pay", "Approved requests. Pay only those marked Yes, then record the UTR."],
  ["balance", "Balances to raise", "Advances you raised that are now paid. Open one and raise the balance when it's due. It goes through approval again."],
  ["fix", "Sent back to you", "An approver returned these. Open one to see why, edit it and resubmit."],
];

export default function Queue() {
  const { ctx, loaded, offline, offlineMsg } = useStore();
  const { open } = useDrawer();
  const navigate = useNavigate();

  if (offline) return <EmptyBox title="Not connected" text={offlineMsg || "The desk couldn't load. Reload the page."} />;
  if (!loaded) return <EmptyBox title="Loading requests…" text="" />;

  const noRoles = !roleIds(ctx, "approver1").length || !roleIds(ctx, "finance").length;
  const mine = ctx.requests.filter((r) => myAction(ctx, r));
  const myOpen = ctx.requests.filter((r) => r.requestedBy === ctx.me.id && ["pending_l1", "pending_l2", "approved"].indexOf(r.status) >= 0);

  const groupRows = (kind) => mine.filter((r) => myAction(ctx, r) === kind)
    .sort((a, b) => ((b.priority === "urgent") - (a.priority === "urgent")) || String(a.dueDate || "9").localeCompare(String(b.dueDate || "9")));

  const anyGroup = GROUPS.some(([kind]) => groupRows(kind).length);

  return (
    <>
      {noRoles && (
        <div className="notice warn">
          <p>{ctx.isAdmin
            ? "Approvers and Finance aren't assigned yet, so new requests will wait. Add them under Approvals & settings."
            : "Approvers haven't been assigned yet. Requests you raise will wait until an admin sets them up."}</p>
          {ctx.isAdmin && <button className="btn" type="button" onClick={() => navigate("/settings")}>Assign people</button>}
        </div>
      )}

      {GROUPS.map(([kind, title, desc]) => {
        const rows = groupRows(kind);
        if (!rows.length) return null;
        const total = kind === "balance"
          ? money0(rows.reduce((s, r) => s + balanceLeft(r), 0)) + " remaining"
          : money0(rows.reduce((s, r) => s + (+r.netPayable || 0), 0));
        return (
          <div key={kind}>
            <div className="group-h"><h2>{title}</h2><span className="muted small">{rows.length} · {total}</span></div>
            <p className="muted small" style={{ margin: "-8px 0 0" }}>{desc}</p>
            <RequestTable rows={rows} />
          </div>
        );
      })}

      {myOpen.length > 0 && (
        <div>
          <div className="group-h"><h2>Raised by you, in progress</h2><span className="muted small">{myOpen.length}</span></div>
          <RequestTable rows={myOpen} />
        </div>
      )}

      {!anyGroup && !myOpen.length && (
        ctx.requests.length
          ? <EmptyBox title="You're all caught up" text={<>Nothing needs your action right now. Everything else is under <strong>All requests</strong>.</>} />
          : <EmptyBox
              title="No payment requests yet"
              text={`Raise the first one with the vendor's invoice or PI attached. TDS is worked out from the nature of payment, and the request goes to Level 1 approval (then Level 2 above ${money0(ctx.settings.tierLimit)}).`}
              action={<button className="btn primary" type="button" onClick={() => open({ mode: "form", editId: null, kind: "new", parent: null })}>New payment request</button>}
            />
      )}
    </>
  );
}
