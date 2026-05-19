import admin from "firebase-admin";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Firebase environment variables are not set.");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

const db = admin.firestore();

type ReportItem = {
  studentId: string;
  student: string;
  parentPhone: string;
  report: string;
  weekKey: string;
};

type LogDoc = FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;

function getStartOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekKey(date = new Date()) {
  return getStartOfWeek(date).toISOString().split("T")[0];
}

function normalisePhone(phone?: string) {
  if (!phone) return "";
  let cleaned = phone.replace(/\s+/g, "").replace(/[^\d+]/g, "");

  if (cleaned.startsWith("0")) cleaned = "27" + cleaned.slice(1);
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);

  return cleaned;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toDate(value: any) {
  if (!value) return null;
  return value.toDate ? value.toDate() : new Date(value);
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

function getQualityScore(quality?: string) {
  const q = String(quality || "").toLowerCase();

  if (q.includes("excellent")) return 4;
  if (q.includes("very good")) return 3.5;
  if (q.includes("good")) return 3;
  if (q.includes("fair")) return 2;
  if (q.includes("weak")) return 1;
  if (q.includes("poor")) return 0.5;

  return 2;
}

function averageQuality(logs: LogDoc[], fields: string[]) {
  let total = 0;
  let count = 0;

  logs.forEach((doc) => {
    const data = doc.data();

    fields.forEach((field) => {
      if (data[field]) {
        total += getQualityScore(data[field]);
        count++;
      }
    });
  });

  return count ? total / count : 0;
}

function getOverallWeek(logs: LogDoc[]) {
  if (logs.length === 0) return "No Logs Recorded";

  const avg = averageQuality(logs, [
    "sabakReadQuality",
    "sabakDhorReadQuality",
    "dhorReadQuality",
  ]);

  if (logs.length >= 5 && avg >= 3.2) return "Outstanding ⭐";
  if (logs.length >= 5 && avg >= 2.7) return "Excellent";
  if (logs.length >= 4 && avg >= 2.2) return "Good";
  if (logs.length >= 3) return "Needs Attention";
  return "Requires More Consistency";
}

function getRevisionStrength(logs: LogDoc[]) {
  if (logs.length === 0) return "No revision recorded";

  const avg = averageQuality(logs, [
    "sabakDhorReadQuality",
    "dhorReadQuality",
  ]);

  if (avg >= 3.2) return "Excellent";
  if (avg >= 2.7) return "Strong";
  if (avg >= 2.1) return "Good";
  return "Needs Attention";
}

function getSabakStrength(logs: LogDoc[]) {
  if (logs.length === 0) return "No sabak recorded";

  const avg = averageQuality(logs, ["sabakReadQuality"]);

  if (avg >= 3.2) return "Excellent";
  if (avg >= 2.7) return "Strong";
  if (avg >= 2.1) return "Good";
  return "Needs Attention";
}

function compareNumber(current: number, previous: number, label: string) {
  if (current > previous) return `✅ ${label} improved`;
  if (current < previous) return `⚠️ ${label} decreased`;
  return `➖ ${label} stayed the same`;
}

function getBadges({
  attendance,
  goalCompleted,
  revisionStrength,
  sabakStrength,
}: {
  attendance: number;
  goalCompleted: boolean;
  revisionStrength: string;
  sabakStrength: string;
}) {
  const badges: string[] = [];

  if (attendance >= 5) badges.push("🌟 Full Attendance Star");
  if (goalCompleted) badges.push("🎯 Goal Achiever");
  if (revisionStrength === "Excellent" || revisionStrength === "Strong") {
    badges.push("📚 Strong Revision Badge");
  }
  if (sabakStrength === "Excellent" || sabakStrength === "Strong") {
    badges.push("📖 Sabak Excellence Badge");
  }
  if (badges.length >= 3) badges.push("🔥 Consistency Champion");

  return badges.length ? badges : ["🌱 Building Consistency"];
}

function buildAutoReflection({
  studentName,
  overallWeek,
  attendance,
  goalCompleted,
  revisionStrength,
}: {
  studentName: string;
  overallWeek: string;
  attendance: number;
  goalCompleted: boolean;
  revisionStrength: string;
}) {
  if (overallWeek.includes("Outstanding") || overallWeek === "Excellent") {
    return `Alhamdulillah, ${studentName} had a very pleasing week. The consistency, effort and progress shown are signs of a strong hifdh routine. Please continue encouraging daily revision at home so this momentum continues, in shaa Allah.`;
  }

  if (attendance <= 2) {
    return `${studentName} will benefit greatly from stronger attendance and consistency. Regular attendance is one of the biggest keys to steady hifdh progress. Please help ensure a stronger routine next week, in shaa Allah.`;
  }

  if (revisionStrength === "Needs Attention") {
    return `${studentName} is making effort, but revision requires extra attention. A few minutes of listening at home daily can make a big difference in strengthening older work.`;
  }

  if (!goalCompleted) {
    return `${studentName} made progress this week, but the weekly goal was not fully completed. With stronger preparation and revision next week, better progress can be achieved, in shaa Allah.`;
  }

  return `Alhamdulillah, ${studentName} made steady progress this week. Please continue supporting the hifdh journey at home through encouragement, revision and du'aa.`;
}

function buildParentFocus({
  attendance,
  goalCompleted,
  revisionStrength,
}: {
  attendance: number;
  goalCompleted: boolean;
  revisionStrength: string;
}) {
  if (attendance <= 2) {
    return "Please focus on full attendance next week. Consistency is one of the strongest foundations for successful hifdh.";
  }

  if (revisionStrength === "Needs Attention") {
    return "Please listen to revision over the weekend, especially older dhor, so the memorised work remains firm.";
  }

  if (!goalCompleted) {
    return "Please encourage preparation before class so the weekly goal can be completed next week, in shaa Allah.";
  }

  return "Please continue encouraging daily revision at home. Even a short, consistent routine makes a major difference.";
}

function calculateGoalStreak(allLogs: LogDoc[]) {
  let streak = 0;

  const weekMap = new Map<string, boolean>();

  allLogs.forEach((doc) => {
    const data = doc.data();
    const date = toDate(data.createdAt);
    if (!date) return;

    const key = formatWeekKey(date);
    if (!weekMap.has(key)) {
      weekMap.set(key, !!data.weeklyGoalCompleted);
    }
  });

  const weeks = [...weekMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  for (const [, completed] of weeks) {
    if (completed) streak++;
    else break;
  }

  return streak;
}

function calculateLoggedDayStreak(allLogs: LogDoc[]) {
  const days = new Set<string>();

  allLogs.forEach((doc) => {
    const date = toDate(doc.data().createdAt);
    if (!date) return;
    days.add(date.toISOString().split("T")[0]);
  });

  let streak = 0;
  const cursor = new Date();

  for (let i = 0; i < 60; i++) {
    const key = cursor.toISOString().split("T")[0];

    if (days.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

export async function GET() {
  try {
    const usersSnapshot = await db.collection("users").get();
    const reports: ReportItem[] = [];

    const weekKey = formatWeekKey();

    const weekStart = getStartOfWeek();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const previousWeekStart = new Date(weekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    const monthStart = new Date();
    monthStart.setDate(monthStart.getDate() - 30);

    const weekRange = `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`;

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();

      const sendDocId = `${weekKey}_${userDoc.id}`;
      const alreadySentDoc = await db
        .collection("weeklyReportSends")
        .doc(sendDocId)
        .get();

      if (alreadySentDoc.exists) continue;

      const logsSnapshot = await db
        .collection("users")
        .doc(userDoc.id)
        .collection("logs")
        .orderBy("createdAt", "desc")
        .get();

      const allLogs = logsSnapshot.docs;

      const currentWeekLogs = allLogs.filter((doc) => {
        const date = toDate(doc.data().createdAt);
        return date && date >= weekStart && date <= weekEnd;
      });

      const previousWeekLogs = allLogs.filter((doc) => {
        const date = toDate(doc.data().createdAt);
        return date && date >= previousWeekStart && date < weekStart;
      });

      const monthlyLogs = allLogs.filter((doc) => {
        const date = toDate(doc.data().createdAt);
        return date && date >= monthStart;
      });

      const sortedCurrentLogs = [...currentWeekLogs].sort((a, b) => {
        const aDate = toDate(a.data().createdAt)?.getTime() ?? 0;
        const bDate = toDate(b.data().createdAt)?.getTime() ?? 0;
        return aDate - bDate;
      });

      const studentName = userData.username ?? "Student";
      const latestLog = currentWeekLogs[0]?.data();

      const weeklyGoal = latestLog?.weeklyGoal ?? "-";
      const goalCompleted = !!latestLog?.weeklyGoalCompleted;
      const goalStatus = goalCompleted ? "Achieved ✅" : "In Progress ⚠️";
      const duration = latestLog?.weeklyGoalDurationDays ?? "-";

      const attendance = currentWeekLogs.length;
      const previousAttendance = previousWeekLogs.length;

      const overallWeek = getOverallWeek(currentWeekLogs);
      const revisionStrength = getRevisionStrength(currentWeekLogs);
      const sabakStrength = getSabakStrength(currentWeekLogs);

      const previousRevisionAvg = averageQuality(previousWeekLogs, [
        "sabakDhorReadQuality",
        "dhorReadQuality",
      ]);

      const currentRevisionAvg = averageQuality(currentWeekLogs, [
        "sabakDhorReadQuality",
        "dhorReadQuality",
      ]);

      const previousSabakAvg = averageQuality(previousWeekLogs, ["sabakReadQuality"]);
      const currentSabakAvg = averageQuality(currentWeekLogs, ["sabakReadQuality"]);

      const goalStreak = calculateGoalStreak(allLogs);
      const loggedDayStreak = calculateLoggedDayStreak(allLogs);

      const badges = getBadges({
        attendance,
        goalCompleted,
        revisionStrength,
        sabakStrength,
      });

      const autoReflection = buildAutoReflection({
        studentName,
        overallWeek,
        attendance,
        goalCompleted,
        revisionStrength,
      });

      const weeklyReflection =
        latestLog?.weeklyReflection &&
        String(latestLog.weeklyReflection).trim().length > 0
          ? String(latestLog.weeklyReflection).trim()
          : autoReflection;

      const parentFocus = buildParentFocus({
        attendance,
        goalCompleted,
        revisionStrength,
      });

      const monthlyAttendance = monthlyLogs.length;
      const monthlyGoalsAchieved = monthlyLogs.filter(
        (doc) => doc.data().weeklyGoalCompleted
      ).length;

      let reportText = `السلام عليكم ورحمة الله وبركاته

🌙 *Weekly Hifdh Journey Report*

*Student:* ${studentName}
*Ustad:* Moulana Shaheed Bhabha
*Week:* ${weekRange}

━━━━━━━━━━━━━━━━━━

🏆 *This Week’s Snapshot*

⭐ *Overall Week:* ${overallWeek}
📅 *Attendance:* ${attendance}/5 days
🎯 *Weekly Goal:* ${weeklyGoal}
✅ *Goal Status:* ${goalStatus}
📖 *Sabak Strength:* ${sabakStrength}
🔁 *Revision Strength:* ${revisionStrength}
⏳ *Goal Duration:* ${duration} days

━━━━━━━━━━━━━━━━━━

💬 *Weekly Reflection From Ustad*

${weeklyReflection}

━━━━━━━━━━━━━━━━━━

📈 *Progress Compared To Last Week*

${compareNumber(attendance, previousAttendance, "Attendance")}
${compareNumber(currentSabakAvg, previousSabakAvg, "Sabak quality")}
${compareNumber(currentRevisionAvg, previousRevisionAvg, "Revision quality")}

━━━━━━━━━━━━━━━━━━

🔥 *Current Streaks*

• ${goalStreak} weekly goal(s) achieved in a row
• ${loggedDayStreak} consecutive logged day(s)

━━━━━━━━━━━━━━━━━━

🏅 *This Week’s Achievements*

${badges.map((badge) => `• ${badge}`).join("\n")}

━━━━━━━━━━━━━━━━━━

🏡 *Parent Focus For The Weekend*

${parentFocus}

━━━━━━━━━━━━━━━━━━

📊 *Monthly Summary*

📅 Logs Recorded: ${monthlyAttendance}
🎯 Goals Achieved: ${monthlyGoalsAchieved}
📖 Strongest Area: ${sabakStrength}
🔁 Focus Area: ${
        revisionStrength === "Needs Attention"
          ? "Older dhor revision"
          : "Maintain consistency"
      }

`;

      if (currentWeekLogs.length > 0) {
        reportText += `━━━━━━━━━━━━━━━━━━

📚 *Detailed Daily Breakdown*

`;

        sortedCurrentLogs.forEach((logDoc, index) => {
          const logData = logDoc.data();
          const dateObj = toDate(logData.createdAt) ?? new Date();

          const dayName = dateObj.toLocaleDateString("en-US", {
            weekday: "long",
          });

          const dateFormatted = dateObj.toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
          });

          reportText += `📅 *${dayName} - ${dateFormatted}*

📖 *Sabak*
${logData.sabak ?? "-"} | ${logData.sabakReadQuality ?? "-"}`;

          if (logData.sabakReadNotes) {
            reportText += `
_Note:_ ${logData.sabakReadNotes}`;
          }

          reportText += `

🔁 *Sabak Dhor*
${logData.sabakDhor ?? "-"} | ${logData.sabakDhorReadQuality ?? "-"}`;

          if (logData.sabakDhorReadNotes) {
            reportText += `
_Note:_ ${logData.sabakDhorReadNotes}`;
          }

          reportText += `

📚 *Dhor*
${logData.dhor ?? "-"} | ${logData.dhorReadQuality ?? "-"}`;

          if (logData.dhorReadNotes) {
            reportText += `
_Note:_ ${logData.dhorReadNotes}`;
          }

          if (logData.generalNotes) {
            reportText += `

🗒️ *General Note*
${logData.generalNotes}`;
          }

          if (index !== sortedCurrentLogs.length - 1) {
            reportText += `

──────────────

`;
          }
        });
      } else {
        reportText += `━━━━━━━━━━━━━━━━━━

No logs were recorded this week.

Please ensure daily progress is logged so parents can receive meaningful weekly feedback.`;
      }

      reportText += `

━━━━━━━━━━━━━━━━━━

💬 *Parent Reply Options*

You may reply with:

1️⃣ Concern  
2️⃣ Appreciation  
3️⃣ Question for Ustad  

━━━━━━━━━━━━━━━━━━

May Allah place barakah in this hifdh journey and make the Qur’an a means of success in this world and the Aakhirah.

*The Hifdh Journal*`;

      reports.push({
        studentId: userDoc.id,
        student: studentName,
        parentPhone: normalisePhone(userData.parentPhone),
        report: reportText.trim(),
        weekKey,
      });
    }

    let html = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Weekly Hifdh Reports</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              background: #f4f6f8;
              margin: 0;
              padding: 24px;
            }
            .wrap {
              max-width: 1100px;
              margin: 0 auto;
            }
            .title {
              font-size: 28px;
              font-weight: 700;
              margin-bottom: 8px;
            }
            .subtitle {
              color: #666;
              margin-bottom: 24px;
            }
            .card {
              border: 1px solid #e5e7eb;
              padding: 20px;
              margin-bottom: 20px;
              border-radius: 14px;
              background: #fff;
              box-shadow: 0 2px 10px rgba(0,0,0,0.04);
            }
            .student {
              font-size: 22px;
              font-weight: 700;
              margin-bottom: 8px;
            }
            .phone {
              color: #666;
              margin-bottom: 12px;
            }
            pre {
              white-space: pre-wrap;
              font-family: monospace;
              background: #fafafa;
              padding: 14px;
              border-radius: 10px;
              border: 1px solid #eee;
              line-height: 1.55;
            }
            .btn-row {
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
              margin-top: 14px;
            }
            button, a.btn {
              border: none;
              padding: 10px 14px;
              border-radius: 10px;
              cursor: pointer;
              text-decoration: none;
              display: inline-block;
              font-size: 14px;
              font-weight: 600;
            }
            .copy-btn {
              background: #111827;
              color: white;
            }
            .wa-btn {
              background: #25D366;
              color: white;
            }
            .disabled {
              background: #d1d5db !important;
              color: #6b7280 !important;
              cursor: not-allowed !important;
              pointer-events: none;
            }
            .empty {
              background: white;
              border-radius: 14px;
              padding: 24px;
              border: 1px solid #e5e7eb;
            }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="title">Weekly Hifdh Reports</div>
            <div class="subtitle">Week starting: ${weekKey}</div>
    `;

    if (reports.length === 0) {
      html += `
        <div class="empty">
          All reports for this week have been handled.
        </div>
      `;
    } else {
      reports.forEach((r) => {
        const encodedMessage = encodeURIComponent(r.report);
        const whatsappUrl = r.parentPhone
          ? `https://wa.me/${r.parentPhone}?text=${encodedMessage}`
          : "";

        html += `
          <div class="card" id="card-${r.studentId}">
            <div class="student">${escapeHtml(r.student)}</div>
            <div class="phone">Parent: ${escapeHtml(
              r.parentPhone || "No parent number saved"
            )}</div>

            <pre>${escapeHtml(r.report)}</pre>

            <div class="btn-row">
              <button
                class="copy-btn"
                onclick="navigator.clipboard.writeText(${JSON.stringify(r.report)})"
              >
                Copy Report
              </button>

              ${
                r.parentPhone
                  ? `<a
                      href="${whatsappUrl}"
                      target="_blank"
                      class="btn wa-btn"
                      onclick="markAsSent('${r.studentId}', '${r.weekKey}')"
                    >
                      Send on WhatsApp
                    </a>`
                  : `<span class="btn disabled">No parent number</span>`
              }
            </div>
          </div>
        `;
      });
    }

    html += `
          </div>

          <script>
            async function markAsSent(studentId, weekKey) {
              try {
                await fetch(window.location.pathname, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({ studentId, weekKey })
                });

                const card = document.getElementById("card-" + studentId);
                if (card) card.remove();

                if (!document.querySelector(".card")) {
                  const wrap = document.querySelector(".wrap");
                  const existingEmpty = document.querySelector(".empty");

                  if (!existingEmpty && wrap) {
                    const div = document.createElement("div");
                    div.className = "empty";
                    div.textContent = "All reports for this week have been handled.";
                    wrap.appendChild(div);
                  }
                }
              } catch (error) {
                console.error("Failed to mark report as sent", error);
              }
            }
          </script>
        </body>
      </html>
    `;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error(err);
    return new Response("Server error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { studentId, weekKey } = body;

    if (!studentId || !weekKey) {
      return new Response("Missing studentId or weekKey", { status: 400 });
    }

    const docId = `${weekKey}_${studentId}`;

    await db.collection("weeklyReportSends").doc(docId).set({
      studentId,
      weekKey,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return new Response("Failed to mark report as sent", { status: 500 });
  }
}