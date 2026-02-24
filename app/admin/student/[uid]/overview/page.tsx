/* app/admin/student/[uid]/overview/page.tsx */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, getDoc, getDocs, orderBy, query, doc } from "firebase/firestore";
import { auth, db } from "../../../../lib/firebase";

/* ---------------- helpers ---------------- */
function toText(v: unknown) {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : String(v);
}

function num(v: unknown) {
  const s = toText(v).trim();
  if (!s) return 0;
  const m = s.replace(",", ".").match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

function parseDateKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function diffDaysInclusive(startKey: string, endKey: string) {
  const a = parseDateKey(startKey);
  const b = parseDateKey(endKey);
  const ms = b.getTime() - a.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return Math.max(0, days) + 1;
}

type LogRow = {
  id: string;
  dateKey?: string;

  sabak?: string;
  sabakRead?: string;
  sabakReadNotes?: string;

  sabakDhor?: string;
  sabakDhorRead?: string;
  sabakDhorReadNotes?: string;

  dhor?: string;
  dhorRead?: string;
  dhorReadNotes?: string;

  weeklyGoal?: string;

  sabakDhorMistakes?: string;
  dhorMistakes?: string;

  weeklyGoalStartDateKey?: string;
  weeklyGoalCompletedDateKey?: string;
  weeklyGoalDurationDays?: number | string;
};

async function fetchLogs(uid: string): Promise<LogRow[]> {
  const q = query(collection(db, "users", uid, "logs"), orderBy("dateKey", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-white/70 px-3 py-1 text-xs font-medium text-gray-700 backdrop-blur">
      {children}
    </span>
  );
}

export default function AdminStudentOverviewPage() {
  const params = useParams<{ uid: string }>();
  const studentUid = params.uid;

  const [me, setMe] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [studentEmail, setStudentEmail] = useState<string>("");

  const [rows, setRows] = useState<LogRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setMe(u);

      if (!u) {
        setIsAdmin(false);
        setChecking(false);
        return;
      }

      try {
        const myDoc = await getDoc(doc(db, "users", u.uid));
        const role = myDoc.exists() ? (myDoc.data() as any).role : null;
        setIsAdmin(role === "admin");
      } finally {
        setChecking(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    async function loadStudentMeta() {
      const sDoc = await getDoc(doc(db, "users", studentUid));
      if (sDoc.exists()) {
        const data = sDoc.data() as any;
        setStudentEmail(toText(data.email));
      }
    }

    async function loadLogs() {
      setLoadingRows(true);
      try {
        const data = await fetchLogs(studentUid);
        setRows(data);
      } finally {
        setLoadingRows(false);
      }
    }

    if (studentUid) {
      loadStudentMeta();
      loadLogs();
    }
  }, [studentUid]);

  const summary = useMemo(() => {
    if (!rows.length) return { totalDays: 0, avgSabak: 0, lastGoal: 0 };
    const sabakNums = rows.map((r) => num(r.sabak)).filter((n) => n > 0);
    const avgSabak =
      sabakNums.length ? sabakNums.reduce((a, b) => a + b, 0) / sabakNums.length : 0;
    const lastGoal = num(rows[0]?.weeklyGoal);
    return { totalDays: rows.length, avgSabak, lastGoal };
  }, [rows]);

  if (checking) return <div className="p-10">Loading…</div>;
  if (!me) return <div className="p-10">Please sign in.</div>;
  if (!isAdmin) return <div className="p-10">Not allowed.</div>;

  return (
    <main className="min-h-screen text-gray-900 p-10">
      <h1 className="text-2xl font-semibold mb-6">
        Student Overview — {studentEmail || "Student"}
      </h1>

      <div className="overflow-x-auto">
        <table className="min-w-[1400px] w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-gray-500">
              <th className="pb-3 pr-4 pl-2 border-b">Date</th>

              <th className="pb-3 px-4 border-b border-l">Sabak</th>
              <th className="pb-3 px-4 border-b border-l">Read</th>
              <th className="pb-3 px-4 border-b border-l">Notes</th>

              <th className="pb-3 px-4 border-b border-l">Sabak Dhor</th>
              <th className="pb-3 px-4 border-b border-l">Read</th>
              <th className="pb-3 px-4 border-b border-l">Notes</th>

              <th className="pb-3 px-4 border-b border-l">Dhor</th>
              <th className="pb-3 px-4 border-b border-l">Read</th>
              <th className="pb-3 px-4 border-b border-l">Notes</th>

              <th className="pb-3 px-4 border-b border-l">SD Mistakes</th>
              <th className="pb-3 px-4 border-b border-l">D Mistakes</th>
              <th className="pb-3 px-4 border-b border-l">Weekly Goal</th>
              <th className="pb-3 px-4 border-b border-l">Duration</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200">
            {rows.map((r) => (
              <tr key={r.id} className="text-sm hover:bg-gray-50">
                <td className="py-4 pr-4 pl-2 font-medium">
                  {r.dateKey ?? r.id}
                </td>

                <td className="py-4 px-4 border-l">{toText(r.sabak) || "—"}</td>
                <td className="py-4 px-4 border-l">{toText(r.sabakRead) || "—"}</td>
                <td className="py-4 px-4 border-l max-w-[240px] break-words whitespace-normal">
                  {toText(r.sabakReadNotes) || "—"}
                </td>

                <td className="py-4 px-4 border-l">{toText(r.sabakDhor) || "—"}</td>
                <td className="py-4 px-4 border-l">{toText(r.sabakDhorRead) || "—"}</td>
                <td className="py-4 px-4 border-l max-w-[240px] break-words whitespace-normal">
                  {toText(r.sabakDhorReadNotes) || "—"}
                </td>

                <td className="py-4 px-4 border-l">{toText(r.dhor) || "—"}</td>
                <td className="py-4 px-4 border-l">{toText(r.dhorRead) || "—"}</td>
                <td className="py-4 px-4 border-l max-w-[240px] break-words whitespace-normal">
                  {toText(r.dhorReadNotes) || "—"}
                </td>

                <td className="py-4 px-4 border-l">{toText(r.sabakDhorMistakes) || "—"}</td>
                <td className="py-4 px-4 border-l">{toText(r.dhorMistakes) || "—"}</td>

                <td className="py-4 px-4 border-l">{toText(r.weeklyGoal) || "—"}</td>

                <td className="py-4 px-4 border-l">
                  {r.weeklyGoalDurationDays
                    ? `${r.weeklyGoalDurationDays} day(s)`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}