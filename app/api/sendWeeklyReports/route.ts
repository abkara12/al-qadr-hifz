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

  if (cleaned.startsWith("0")) {
    cleaned = "27" + cleaned.slice(1);
  }

  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }

  return cleaned;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

function getQualityScore(quality?: string) {
  const q = String(quality || "").toLowerCase();

  if (q.includes("excellent")) return 3;
  if (q.includes("very good")) return 3;
  if (q.includes("good")) return 2;
  if (q.includes("fair")) return 1;
  if (q.includes("weak")) return 0;
  if (q.includes("poor")) return 0;

  return 1;
}

function getOverallWeekLabel(logs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  if (logs.length === 0) return "No Logs Recorded";

  let total = 0;
  let count = 0;

  logs.forEach((logDoc) => {
    const logData = logDoc.data();

    [
      logData.sabakReadQuality,
      logData.sabakDhorReadQuality,
      logData.dhorReadQuality,
    ].forEach((quality) => {
      if (quality) {
        total += getQualityScore(quality);
        count++;
      }
    });
  });

  const average = count > 0 ? total / count : 1;

  if (logs.length >= 5 && average >= 2.4) return "Excellent";
  if (logs.length >= 4 && average >= 1.7) return "Good";
  if (logs.length >= 2) return "Needs Attention";

  return "Requires Consistency";
}

function getRevisionLabel(logs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  if (logs.length === 0) return "No revision recorded";

  let total = 0;
  let count = 0;

  logs.forEach((logDoc) => {
    const logData = logDoc.data();

    [logData.sabakDhorReadQuality, logData.dhorReadQuality].forEach((quality) => {
      if (quality) {
        total += getQualityScore(quality);
        count++;
      }
    });
  });

  const average = count > 0 ? total / count : 1;

  if (average >= 2.4) return "Strong";
  if (average >= 1.7) return "Good";
  return "Needs Attention";
}

function buildWeeklyReflection({
  studentName,
  overallWeek,
  attendanceCount,
  revisionLabel,
  goalCompleted,
}: {
  studentName: string;
  overallWeek: string;
  attendanceCount: number;
  revisionLabel: string;
  goalCompleted: boolean;
}) {
  if (overallWeek === "Excellent") {
    return `Alhamdulillah, ${studentName} had an excellent week. The consistency, effort and progress were very pleasing. May Allah continue to place barakah in this hifdh journey.`;
  }

  if (overallWeek === "Good") {
    return `Alhamdulillah, ${studentName} had a good week overall. With a little more consistency and revision at home, even stronger progress can be made, in shaa Allah.`;
  }

  if (attendanceCount <= 2) {
    return `${studentName} will benefit greatly from stronger attendance and consistency. Regular attendance is very important for steady hifdh progress.`;
  }

  if (revisionLabel === "Needs Attention") {
    return `${studentName} is making effort, but revision needs extra attention. Please assist with revision at home so that the older work remains strong.`;
  }

  if (!goalCompleted) {
    return `${studentName} made some progress this week, but the weekly goal was not fully completed. A stronger push next week will help, in shaa Allah.`;
  }

  return `${studentName} made progress this week. Please continue encouraging consistent preparation and revision at home.`;
}

function buildParentAction({
  revisionLabel,
  goalCompleted,
  attendanceCount,
}: {
  revisionLabel: string;
  goalCompleted: boolean;
  attendanceCount: number;
}) {
  if (attendanceCount <= 2) {
    return "Please try to ensure full attendance next week, as consistency is one of the biggest keys to hifdh progress.";
  }

  if (revisionLabel === "Needs Attention") {
    return "Please listen to revision over the weekend, especially older dhor, so that the memorised work remains strong.";
  }

  if (!goalCompleted) {
    return "Please encourage preparation before class so the weekly goal can be completed next week, in shaa Allah.";
  }

  return "Please continue encouraging daily revision at home so this beautiful progress continues, in shaa Allah.";
}

export async function GET() {
  try {
    const usersSnapshot = await db.collection("users").get();
    const reports: ReportItem[] = [];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const weekKey = formatWeekKey();

    const weekStart = getStartOfWeek();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekRange = `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;

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

      const recentLogs = logsSnapshot.docs.filter((logDoc) => {
        const logData = logDoc.data();
        const createdAt = logData.createdAt;
        if (!createdAt) return false;

        const logDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
        return logDate >= sevenDaysAgo;
      });

      const sortedLogsOldestFirst = [...recentLogs].sort((a, b) => {
        const aDate = a.data().createdAt?.toDate
          ? a.data().createdAt.toDate().getTime()
          : 0;

        const bDate = b.data().createdAt?.toDate
          ? b.data().createdAt.toDate().getTime()
          : 0;

        return aDate - bDate;
      });

      const studentName = userData.username ?? "Student";

      const latestLog = recentLogs[0]?.data();
      const weeklyGoal = latestLog?.weeklyGoal ?? "-";
      const goalCompleted = !!latestLog?.weeklyGoalCompleted;
      const goalStatus = goalCompleted ? "Achieved ✅" : "In Progress ⚠️";
      const duration = latestLog?.weeklyGoalDurationDays ?? "-";

      const attendanceCount = recentLogs.length;
      const overallWeek = getOverallWeekLabel(recentLogs);
      const revisionLabel = getRevisionLabel(recentLogs);

      const weeklyReflection = buildWeeklyReflection({
        studentName,
        overallWeek,
        attendanceCount,
        revisionLabel,
        goalCompleted,
      });

      const parentAction = buildParentAction({
        revisionLabel,
        goalCompleted,
        attendanceCount,
      });

      let reportText = `السلام عليكم ورحمة الله وبركاته

🌙 *Weekly Hifdh Progress Report*

*Student:* ${studentName}
*Ustad:* Moulana Shaheed Bhabha
*Week:* ${weekRange}

━━━━━━━━━━━━━━━━━━

📌 *Weekly Summary*

⭐ *Overall Week:* ${overallWeek}
📅 *Attendance:* ${attendanceCount}/5 days
🎯 *Weekly Goal:* ${weeklyGoal}
✅ *Goal Status:* ${goalStatus}
📖 *Revision:* ${revisionLabel}
⏳ *Goal Duration:* ${duration} days

━━━━━━━━━━━━━━━━━━

📝 *Weekly Reflection From Ustad*

${weeklyReflection}

━━━━━━━━━━━━━━━━━━

📌 *Parent Focus For The Weekend*

${parentAction}

`;

      if (recentLogs.length > 0) {
        reportText += `
━━━━━━━━━━━━━━━━━━

📚 *Detailed Daily Breakdown*

`;

        sortedLogsOldestFirst.forEach((logDoc, index) => {
          const logData = logDoc.data();

          const dateObj = logData.createdAt?.toDate
            ? logData.createdAt.toDate()
            : new Date();

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

          if (index !== sortedLogsOldestFirst.length - 1) {
            reportText += `

──────────────

`;
          }
        });

        reportText += `

━━━━━━━━━━━━━━━━━━

May Allah place barakah in this hifdh journey and make the Qur’an a means of success in this world and the Aakhirah.

*The Hifdh Journal*`;
      } else {
        reportText += `
━━━━━━━━━━━━━━━━━━

No logs were recorded for this week.

Please ensure daily progress is logged so that parents can receive meaningful weekly feedback.

━━━━━━━━━━━━━━━━━━

*The Hifdh Journal*`;
      }

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
                if (card) {
                  card.remove();
                }

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
                console.error("Failed to mark as sent", error);
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