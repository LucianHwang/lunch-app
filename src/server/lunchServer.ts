import { readFile } from "node:fs/promises";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { recommendLunch } from "../domain/recommend.js";
import { castVote, voteSummary } from "../domain/votes.js";

/** 추천 결과를 그리는 위젯 리소스. */
export const WIDGET_URI = "ui://lunch/recommendations.html";

/** 위젯 HTML을 만든다. 스크립트는 npm run build:widget이 만든 dist/widget.js를 인라인한다. */
async function widgetHtml(): Promise<string> {
    const [script, css] = await Promise.all([readFile("dist/widget.js", "utf8"), readFile("src/widget/styles.css", "utf8")]);
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css}</style></head>`
        + `<body><div id="root"></div><script type="module">${script}</script></body></html>`;
}

/** 요청마다 새 MCP 서버를 만든다(무상태 Streamable HTTP). */
export function createLunchServer(): McpServer {
    const server = new McpServer({ name: "lunch-app", version: "0.1.0" });

    registerAppResource(server, "점심 추천 위젯", WIDGET_URI, { description: "추천 식당 카드, 룰렛, 팀 투표 화면" }, async () => ({
        contents: [{ uri: WIDGET_URI, mimeType: RESOURCE_MIME_TYPE, text: await widgetHtml() }],
    }));

    registerAppTool(server, "recommend_lunch", {
        title: "점심 추천",
        description: "회사 근처 식당 중에서 예산, 도보 시간, 최근 방문 기록을 고려해 점심 후보를 추천한다. 선택하면 가격순 또는 도보순으로 오름차순 정렬한다.",
        inputSchema: z.object({
            budget: z.number().int().positive().optional().describe("1인 예산(원)"),
            maxWalkMinutes: z.number().int().positive().optional().describe("최대 도보 시간(분)"),
            recentVisits: z.array(z.object({ restaurantId: z.string(), date: z.string() })).optional().describe("최근 방문 기록"),
            sort: z.enum(["price", "walk"]).optional().describe("후보 정렬 기준(가격순 또는 도보순)")
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
        _meta: { ui: { resourceUri: WIDGET_URI } },
    }, async (args) => {
        const candidates = recommendLunch({ ...args, today: new Date().toISOString().slice(0, 10) });
        return {
            content: [{ type: "text", text: candidates.length > 0 ? `추천 후보: ${candidates.map((c) => c.name).join(", ")}` : "조건에 맞는 식당이 없습니다." }],
            structuredContent: { candidates, votes: voteSummary(), sort: args.sort ?? null },
        };
    });

    registerAppTool(server, "vote_lunch", {
        title: "점심 투표",
        description: "추천 후보 중 하나에 투표하고 현재 득표 현황을 돌려준다.",
        inputSchema: z.object({
            restaurantId: z.string().describe("투표할 식당 ID"),
            voter: z.string().describe("투표한 사람 이름"),
        }),
        annotations: { readOnlyHint: false, openWorldHint: false },
        _meta: { ui: { resourceUri: WIDGET_URI, visibility: ["app"] } },
    }, async ({ restaurantId, voter }) => {
        castVote({ restaurantId, voter });
        const votes = voteSummary();
        return {
            content: [{ type: "text", text: `${voter}님의 투표를 기록했습니다.` }],
            structuredContent: { votes },
        };
    });

    return server;
}
