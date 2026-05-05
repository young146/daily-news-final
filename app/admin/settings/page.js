"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { syncAllTopNewsAction } from "../actions";

export default function SettingsPage() {
  const [crawlStatus, setCrawlStatus] = useState({});
  const [systemInfo, setSystemInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncingTopNews, setSyncingTopNews] = useState(false);
  const [crawlerLogs, setCrawlerLogs] = useState([]);
  const [expandedLog, setExpandedLog] = useState(null);
  const [resettingCardNews, setResettingCardNews] = useState(false);

  useEffect(() => {
    fetchSystemInfo();
    fetchCrawlerLogs();
  }, []);


  const resetCardNews = async () => {
    // ... (기존 코드)
  };

  const syncTopNews = async () => {
    if (
      !confirm(
        "모든 발행 뉴스의 탑뉴스 상태를 WordPress와 강제 동기화하시겠습니까?\n\n이 작업은 시간이 다소 걸릴 수 있으며, WordPress에 남아있는 과거 유령 탑뉴스들을 모두 해제합니다."
      )
    ) {
      return;
    }

    setSyncingTopNews(true);
    try {
      const result = await syncAllTopNewsAction();
      if (result.success) {
        alert(result.message);
      } else {
        alert("동기화 실패: " + result.error);
      }
    } catch (error) {
      console.error("Failed to sync:", error);
      alert("동기화 실패: " + error.message);
    } finally {
      setSyncingTopNews(false);
    }
  };

  const fetchCrawlerLogs = async () => {
    try {
      const res = await fetch("/api/crawler-logs");
      const data = await res.json();
      setCrawlerLogs(data.logs || []);
    } catch (error) {
      console.error("Failed to fetch crawler logs:", error);
    }
  };

  const fetchSystemInfo = async () => {
    try {
      const res = await fetch("/api/system-info");
      const data = await res.json();
      setSystemInfo(data);
    } catch (error) {
      console.error("Failed to fetch system info:", error);
    } finally {
      setLoading(false);
    }
  };

  const crawlSource = async (source) => {
    setCrawlStatus((prev) => ({ ...prev, [source]: "crawling" }));
    try {
      const res = await fetch("/api/crawl-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();
      if (data.success) {
        setCrawlStatus((prev) => ({
          ...prev,
          [source]: `완료 (${data.count}개)`,
        }));
      } else {
        setCrawlStatus((prev) => ({
          ...prev,
          [source]: `오류: ${data.error}`,
        }));
      }
    } catch (error) {
      setCrawlStatus((prev) => ({
        ...prev,
        [source]: `오류: ${error.message}`,
      }));
    }
  };

  const sources = [
    { id: "vnexpress", name: "VnExpress (영문)", file: "vnexpress" },
    { id: "vnexpress-vn", name: "VnExpress (베트남어)", file: "vnexpress-vn" },
    { id: "vnexpress-economy", name: "VnExpress Economy (경제)", file: "vnexpress-economy" },
    { id: "vnexpress-realestate", name: "VnExpress Real Estate (부동산)", file: "vnexpress-realestate" },
    { id: "cafef", name: "Cafef (경제 전문)", file: "cafef" },
    { id: "cafef-realestate", name: "Cafef Real Estate (부동산)", file: "cafef-realestate" },
    { id: "yonhap", name: "Yonhap (연합뉴스 한-베)", file: "yonhap" },
    { id: "yonhap-vietnam", name: "Yonhap Vietnam (한국 주요뉴스 베트남)", file: "yonhap-vietnam" },
    { id: "yonhap-main", name: "Yonhap Main (한국 주요뉴스 핫)", file: "yonhap-main" },
    { id: "insidevina", name: "InsideVina", file: "insidevina" },
    { id: "tuoitre", name: "TuoiTre", file: "tuoitre" },
    { id: "thanhnien", name: "ThanhNien", file: "thanhnien" },
    {
      id: "saigoneer",
      name: "Saigoneer 한글판 (음식/여행)",
      file: "saigoneer",
    },
    { id: "soranews24", name: "SoraNews24 (펫/여행)", file: "soranews24" },
    { id: "thedodo", name: "The Dodo (펫)", file: "thedodo" },
    { id: "petmd", name: "PetMD (펫)", file: "petmd" },
    {
      id: "vnexpress-travel",
      name: "VnExpress Travel (여행)",
      file: "vnexpress-travel",
    },
    {
      id: "vnexpress-health",
      name: "VnExpress Health (건강)",
      file: "vnexpress-health",
    },
    { id: "bonappetit", name: "Bon Appétit (음식/레시피)", file: "bonappetit" },
    { id: "health", name: "Health (건강/웰니스)", file: "health" },
  ];

  const commands = [
    {
      title: "전체 크롤링",
      command: "node scripts/crawler.js",
      description: "모든 뉴스 소스에서 크롤링",
    },
    {
      title: "VnExpress 부동산 크롤링",
      command:
        "node -e \"require('./scripts/crawlers/vnexpress-realestate')().then(i => console.log(i.length, 'items'))\"",
      description: "VnExpress 부동산만 테스트 (DB 저장 없음)",
    },
    {
      title: "Yonhap만 크롤링",
      command:
        "node -e \"require('./scripts/crawlers/yonhap')().then(i => console.log(i.length, 'items'))\"",
      description: "연합뉴스만 테스트 (DB 저장 없음)",
    },
    {
      title: "데이터베이스 초기화",
      command: "npx prisma db push",
      description: "Prisma 스키마를 DB에 적용",
    },
    {
      title: "DB 스튜디오",
      command: "npx prisma studio",
      description: "Prisma Studio (DB 관리 UI)",
    },
  ];

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "30px",
        }}
      >
        <h1 style={{ fontSize: "28px", fontWeight: "bold" }}>시스템 설정</h1>
        <Link
          href="/admin"
          style={{
            padding: "10px 20px",
            background: "#6b7280",
            color: "white",
            textDecoration: "none",
            borderRadius: "6px",
          }}
        >
          ← 대시보드로
        </Link>
      </div>

      {/* 크롤러 로그 */}
      <section
        style={{
          background: "white",
          padding: "24px",
          borderRadius: "12px",
          marginBottom: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937" }}>
            📊 크롤러 실행 로그
          </h2>
          <button
            onClick={fetchCrawlerLogs}
            style={{
              padding: "6px 12px",
              background: "#f3f4f6",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            새로고침
          </button>
        </div>
        <p style={{ color: "#6b7280", marginBottom: "20px", fontSize: "14px" }}>
          최근 20개 크롤링 실행 기록입니다. 실패한 소스의 상세 에러를 확인할 수
          있습니다.
        </p>

        {crawlerLogs.length === 0 ? (
          <p style={{ color: "#9ca3af", textAlign: "center", padding: "20px" }}>
            크롤러 로그가 없습니다.
          </p>
        ) : (
          <div style={{ maxHeight: "500px", overflowY: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr
                  style={{ background: "#f9fafb", position: "sticky", top: 0 }}
                >
                  <th
                    style={{
                      padding: "10px",
                      textAlign: "left",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    실행 시간
                  </th>
                  <th
                    style={{
                      padding: "10px",
                      textAlign: "center",
                      borderBottom: "1px solid #e5e7eb",
                      width: "100px",
                    }}
                  >
                    상태
                  </th>
                  <th
                    style={{
                      padding: "10px",
                      textAlign: "center",
                      borderBottom: "1px solid #e5e7eb",
                      width: "80px",
                    }}
                  >
                    저장
                  </th>
                  <th
                    style={{
                      padding: "10px",
                      textAlign: "left",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    요약
                  </th>
                </tr>
              </thead>
              <tbody>
                {crawlerLogs.map((log) => {
                  const hasErrors =
                    log.errorDetails && log.errorDetails !== "null";
                  const errors = hasErrors
                    ? JSON.parse(log.errorDetails)
                    : null;
                  const isExpanded = expandedLog === log.id;

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        style={{
                          borderBottom: "1px solid #f3f4f6",
                          cursor: hasErrors ? "pointer" : "default",
                          background: isExpanded ? "#fef3c7" : "transparent",
                        }}
                        onClick={() =>
                          hasErrors &&
                          setExpandedLog(isExpanded ? null : log.id)
                        }
                      >
                        <td style={{ padding: "10px" }}>
                          {new Date(log.runAt).toLocaleString("ko-KR", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td style={{ padding: "10px", textAlign: "center" }}>
                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "12px",
                              fontWeight: "500",
                              background:
                                log.status === "SUCCESS"
                                  ? "#dcfce7"
                                  : log.status === "PARTIAL"
                                  ? "#fef3c7"
                                  : "#fee2e2",
                              color:
                                log.status === "SUCCESS"
                                  ? "#166534"
                                  : log.status === "PARTIAL"
                                  ? "#92400e"
                                  : "#991b1b",
                            }}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "10px",
                            textAlign: "center",
                            fontWeight: "600",
                            color: "#1f2937",
                          }}
                        >
                          {log.itemsFound}개
                        </td>
                        <td
                          style={{
                            padding: "10px",
                            color: "#6b7280",
                            fontSize: "13px",
                          }}
                        >
                          {log.message?.substring(0, 80)}
                          {log.message?.length > 80 && "..."}
                          {hasErrors && (
                            <span
                              style={{ marginLeft: "8px", color: "#ef4444" }}
                            >
                              {isExpanded ? "▼ 에러 닫기" : "▶ 에러 보기"}
                            </span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && errors && (
                        <tr>
                          <td colSpan={4} style={{ padding: "0" }}>
                            <div
                              style={{
                                background: "#1f2937",
                                padding: "16px",
                                margin: "0 10px 10px 10px",
                                borderRadius: "8px",
                              }}
                            >
                              {Object.entries(errors).map(([source, err]) => (
                                <div
                                  key={source}
                                  style={{ marginBottom: "12px" }}
                                >
                                  <div
                                    style={{
                                      color: "#f87171",
                                      fontWeight: "600",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    ❌ {source}
                                  </div>
                                  <div
                                    style={{
                                      color: "#fbbf24",
                                      fontSize: "13px",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    {err.message}
                                  </div>
                                  {err.stack && (
                                    <pre
                                      style={{
                                        color: "#9ca3af",
                                        fontSize: "11px",
                                        margin: 0,
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-all",
                                      }}
                                    >
                                      {err.stack}
                                    </pre>
                                  )}
                                  <div
                                    style={{
                                      color: "#6b7280",
                                      fontSize: "11px",
                                      marginTop: "4px",
                                    }}
                                  >
                                    {new Date(err.time).toLocaleString("ko-KR")}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 소스별 크롤링 */}
      <section
        style={{
          background: "white",
          padding: "24px",
          borderRadius: "12px",
          marginBottom: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <h2
          style={{
            fontSize: "20px",
            fontWeight: "600",
            marginBottom: "16px",
            color: "#1f2937",
          }}
        >
          📰 소스별 크롤링
        </h2>
        <p style={{ color: "#6b7280", marginBottom: "20px", fontSize: "14px" }}>
          개별 뉴스 소스만 선택적으로 크롤링할 수 있습니다.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "12px",
          }}
        >
          {sources.map((source) => (
            <div
              key={source.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: "#f9fafb",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
              }}
            >
              <div>
                <div style={{ fontWeight: "500", color: "#1f2937" }}>
                  {source.name}
                </div>
                <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                  {source.file}.js
                </div>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                {crawlStatus[source.id] && (
                  <span
                    style={{
                      fontSize: "12px",
                      color: crawlStatus[source.id].includes("오류")
                        ? "#ef4444"
                        : "#10b981",
                    }}
                  >
                    {crawlStatus[source.id]}
                  </span>
                )}
                <button
                  onClick={() => crawlSource(source.id)}
                  disabled={crawlStatus[source.id] === "crawling"}
                  style={{
                    padding: "8px 16px",
                    background:
                      crawlStatus[source.id] === "crawling"
                        ? "#9ca3af"
                        : "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor:
                      crawlStatus[source.id] === "crawling"
                        ? "not-allowed"
                        : "pointer",
                    fontSize: "13px",
                    fontWeight: "500",
                  }}
                >
                  {crawlStatus[source.id] === "crawling"
                    ? "크롤링 중..."
                    : "크롤링"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 시스템 정보 */}
      <section
        style={{
          background: "white",
          padding: "24px",
          borderRadius: "12px",
          marginBottom: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <h2
          style={{
            fontSize: "20px",
            fontWeight: "600",
            marginBottom: "16px",
            color: "#1f2937",
          }}
        >
          ⚙️ 시스템 정보
        </h2>

        {loading ? (
          <p style={{ color: "#6b7280" }}>로딩 중...</p>
        ) : systemInfo ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
              gap: "16px",
            }}
          >
            <InfoCard
              title="데이터베이스"
              value={systemInfo.database?.connected ? "연결됨" : "연결 실패"}
              status={systemInfo.database?.connected ? "success" : "error"}
              detail={`총 ${systemInfo.database?.totalNews || 0}개 뉴스`}
            />
            <InfoCard
              title="WordPress"
              value={systemInfo.wordpress?.configured ? "설정됨" : "미설정"}
              status={systemInfo.wordpress?.configured ? "success" : "warning"}
              detail={systemInfo.wordpress?.url || "-"}
            />
            <InfoCard
              title="OpenAI API"
              value={systemInfo.openai?.configured ? "설정됨" : "미설정"}
              status={systemInfo.openai?.configured ? "success" : "error"}
            />
            <InfoCard
              title="오늘 게시된 뉴스"
              value={`${systemInfo.database?.publishedToday || 0}개`}
              status="info"
            />
          </div>
        ) : (
          <p style={{ color: "#ef4444" }}>시스템 정보를 불러올 수 없습니다.</p>
        )}
      </section>

      {/* WordPress 설정 */}
      <section
        style={{
          background: "white",
          padding: "24px",
          borderRadius: "12px",
          marginBottom: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <h2
          style={{
            fontSize: "20px",
            fontWeight: "600",
            marginBottom: "16px",
            color: "#1f2937",
          }}
        >
          🌐 WordPress 설정
        </h2>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <TableRow label="사이트 URL" value="https://chaovietnam.co.kr" />
            <TableRow label="사용자명" value="chaovietnam" />
            <TableRow label="본문 카테고리" value="6, 31 (뉴스 > 데일리뉴스)" />
            <TableRow
              label="뉴스 터미널 페이지"
              value="https://chaovietnam.co.kr/daily-news-terminal/"
              link
            />
            <TableRow label="Jenny 플러그인 버전" value="v1.4" />
          </tbody>
        </table>
      </section>

      {/* 유용한 명령어 */}
      <section
        style={{
          background: "white",
          padding: "24px",
          borderRadius: "12px",
          marginBottom: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <h2
          style={{
            fontSize: "20px",
            fontWeight: "600",
            marginBottom: "16px",
            color: "#1f2937",
          }}
        >
          💻 터미널 명령어
        </h2>
        <p style={{ color: "#6b7280", marginBottom: "20px", fontSize: "14px" }}>
          Replit Shell에서 직접 실행할 수 있는 명령어입니다.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {commands.map((cmd, index) => (
            <div
              key={index}
              style={{
                padding: "16px",
                background: "#1f2937",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    color: "#10b981",
                    fontWeight: "600",
                    fontSize: "14px",
                  }}
                >
                  {cmd.title}
                </span>
                <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                  {cmd.description}
                </span>
              </div>
              <code
                style={{
                  color: "#fbbf24",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  wordBreak: "break-all",
                }}
              >
                $ {cmd.command}
              </code>
            </div>
          ))}
        </div>
      </section>

      {/* 크롤러 파일 위치 */}
      <section
        style={{
          background: "white",
          padding: "24px",
          borderRadius: "12px",
          marginBottom: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <h2
          style={{
            fontSize: "20px",
            fontWeight: "600",
            marginBottom: "16px",
            color: "#1f2937",
          }}
        >
          📁 파일 구조
        </h2>

        <div
          style={{
            background: "#f9fafb",
            padding: "20px",
            borderRadius: "8px",
            fontFamily: "monospace",
            fontSize: "13px",
            lineHeight: "1.8",
          }}
        >
          <div style={{ color: "#6b7280" }}>scripts/</div>
          <div style={{ paddingLeft: "20px" }}>
            <div style={{ color: "#3b82f6" }}>crawler.js</div>
            <div style={{ color: "#6b7280" }}>crawlers/</div>
            <div style={{ paddingLeft: "20px", color: "#10b981" }}>
              vnexpress.js
              <br />
              vnexpress-vn.js
              <br />
              yonhap.js
              <br />
              insidevina.js
              <br />
              tuoitre.js
              <br />
              thanhnien.js
              <br />
              publicsecurity.js
              <br />
              saigoneer.js
              <br />
              japantoday.js
            </div>
          </div>
          <div style={{ color: "#6b7280", marginTop: "10px" }}>lib/</div>
          <div style={{ paddingLeft: "20px", color: "#f59e0b" }}>
            publisher.js
            <br />
            openai.js
            <br />
            prisma.js
          </div>
          <div style={{ color: "#6b7280", marginTop: "10px" }}>
            wordpress-plugin/
          </div>
          <div style={{ paddingLeft: "20px", color: "#ec4899" }}>
            jenny-daily-news.php (v1.4)
            <br />
            xinchao-image-uploader.php
          </div>
        </div>
      </section>

      {/* 유지보수 가이드 */}
      <section
        style={{
          background: "white",
          padding: "24px",
          borderRadius: "12px",
          marginBottom: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <h2
          style={{
            fontSize: "20px",
            fontWeight: "600",
            marginBottom: "16px",
            color: "#1f2937",
          }}
        >
          🛠️ 크롤러 유지보수 가이드
        </h2>
        <p style={{ color: "#6b7280", marginBottom: "20px", fontSize: "14px" }}>
          크롤러 오류 발생 시 참고하세요. 웹사이트 구조가 바뀌면 셀렉터 수정이
          필요합니다.
        </p>

        {/* 일반적인 에러 유형 */}
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#374151",
            }}
          >
            자주 발생하는 에러
          </h3>
          <div style={{ display: "grid", gap: "12px" }}>
            <ErrorGuide
              error="No content found"
              cause="웹사이트 HTML 구조 변경"
              solution="브라우저 개발자 도구(F12)로 새 셀렉터 찾기"
            />
            <ErrorGuide
              error="SSL_UNSAFE_LEGACY_RENEGOTIATION"
              cause="오래된 SSL 설정"
              solution="axios에 httpsAgent 옵션 추가 (yonhap.js 참고)"
            />
            <ErrorGuide
              error="403 Forbidden"
              cause="User-Agent 차단"
              solution="User-Agent 헤더 변경 또는 추가 헤더 설정"
            />
            <ErrorGuide
              error="ETIMEDOUT / ECONNRESET"
              cause="네트워크 문제 또는 서버 다운"
              solution="timeout 옵션 늘리기 또는 나중에 재시도"
            />
          </div>
        </div>

        {/* 셀렉터 위치 */}
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#374151",
            }}
          >
            크롤러별 셀렉터 위치
          </h3>
          <div
            style={{
              background: "#f9fafb",
              borderRadius: "8px",
              overflow: "hidden",
              fontSize: "13px",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#e5e7eb" }}>
                  <th style={{ padding: "10px", textAlign: "left" }}>크롤러</th>
                  <th style={{ padding: "10px", textAlign: "left" }}>
                    목록 셀렉터
                  </th>
                  <th style={{ padding: "10px", textAlign: "left" }}>
                    내용 셀렉터
                  </th>
                </tr>
              </thead>
              <tbody>
                <SelectorRow
                  name="VnExpress"
                  list=".item-news"
                  content=".fck_detail"
                />
                <SelectorRow
                  name="Yonhap"
                  list=".list-type212 li"
                  content=".article-txt"
                />
                <SelectorRow
                  name="InsideVina"
                  list='a[href*="articleView"]'
                  content="#article-view-content-div"
                />
                <SelectorRow
                  name="TuoiTre"
                  list="h3 a, h2 a"
                  content="#main-detail-body"
                />
                <SelectorRow
                  name="ThanhNien"
                  list=".story"
                  content=".detail-content"
                />
                <SelectorRow
                  name="PublicSecurity"
                  list='a[href*="-i"]'
                  content=".entry-content"
                />
                <SelectorRow
                  name="Saigoneer"
                  list='a[href*="/saigon-"]'
                  content=".item-page"
                />
                <SelectorRow
                  name="SoraNews24"
                  list="soranews24.com/20"
                  content=".entry-content"
                />
              </tbody>
            </table>
          </div>
        </div>

        {/* 셀렉터 수정 방법 */}
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#374151",
            }}
          >
            셀렉터 수정 방법
          </h3>
          <ol
            style={{
              paddingLeft: "24px",
              color: "#4b5563",
              lineHeight: "2",
              fontSize: "14px",
            }}
          >
            <li>해당 뉴스 사이트 방문 (예: vnexpress.net)</li>
            <li>F12 눌러 개발자 도구 열기</li>
            <li>기사 제목/내용 영역 우클릭 → "검사" 또는 "Inspect"</li>
            <li>요소 우클릭 → Copy → Copy selector</li>
            <li>크롤러 파일에서 셀렉터 수정</li>
            <li>
              테스트:{" "}
              <code
                style={{
                  background: "#e5e7eb",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                node -e
                "require('./scripts/crawlers/vnexpress')().then(console.log)"
              </code>
            </li>
          </ol>
        </div>

        {/* AI 도구 활용 */}
        <div
          style={{
            background: "#eff6ff",
            padding: "16px",
            borderRadius: "8px",
            border: "1px solid #bfdbfe",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: "600",
              marginBottom: "8px",
              color: "#1e40af",
            }}
          >
            💡 AI 도구 활용 팁
          </h3>
          <p style={{ color: "#1e40af", fontSize: "13px", margin: 0 }}>
            수정이 어려우면 Claude나 ChatGPT에 다음 정보를 제공하세요:
            <br />
            1) 에러 메시지 전체
            <br />
            2) 해당 크롤러 파일 코드
            <br />
            3) 대상 웹사이트 URL
          </p>
        </div>
      </section>

      {/* 일일 워크플로우 */}
      <section
        style={{
          background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
          padding: "24px",
          borderRadius: "12px",
          marginBottom: "24px",
          border: "1px solid #f59e0b",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#92400e" }}>
            📋 일일 워크플로우
          </h2>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={syncTopNews}
              disabled={syncingTopNews}
              style={{
                padding: "8px 16px",
                background: syncingTopNews ? "#d1d5db" : "#f59e0b",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: syncingTopNews ? "not-allowed" : "pointer",
                fontSize: "13px",
                fontWeight: "600",
              }}
            >
              {syncingTopNews ? "동기화 중..." : "🔥 탑뉴스 전체 동기화"}
            </button>
            <button
              onClick={resetCardNews}
              disabled={resettingCardNews}
              style={{
                padding: "8px 16px",
                background: resettingCardNews ? "#d1d5db" : "#dc2626",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: resettingCardNews ? "not-allowed" : "pointer",
                fontSize: "13px",
                fontWeight: "600",
              }}
            >
              {resettingCardNews ? "초기화 중..." : "🔄 카드 엽서 초기화"}
            </button>
          </div>
        </div>

        <ol style={{ paddingLeft: "24px", color: "#78350f", lineHeight: "2" }}>
          <li>
            <strong>크롤링</strong>: 대시보드에서 "Crawl News" 버튼 클릭 (매일
            아침)
          </li>
          <li>
            <strong>선택</strong>: 게시할 뉴스 ~20개 선택 (TopNews 1개, CardNews
            4개 포함)
          </li>
          <li>
            <strong>번역</strong>: 선택한 뉴스 번역 및 편집
          </li>
          <li>
            <strong>게시</strong>: "Publish Selected" 버튼으로 WordPress에 게시
          </li>
          <li>
            <strong>카드 엽서</strong>: /admin/card-news 에서 카드 엽서 생성 및
            게시
          </li>
          <li>
            <strong>SNS 공유</strong>: 뉴스 터미널 URL 공유
          </li>
        </ol>

        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            background: "rgba(255,255,255,0.6)",
            borderRadius: "8px",
            fontSize: "13px",
            color: "#78350f",
          }}
        >
          💡 <strong>카드 엽서 초기화:</strong> 발행된 뉴스가 카드 엽서 대상에서
          제외됩니다. 다음 뉴스 발행 시 새로운 뉴스들이 자동으로 카드 엽서
          대상이 됩니다.
        </div>
      </section>
    </div>
  );
}

function InfoCard({ title, value, status, detail }) {
  const colors = {
    success: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
    error: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
    warning: { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
    info: { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" },
  };

  const color = colors[status] || colors.info;

  return (
    <div
      style={{
        padding: "16px",
        background: color.bg,
        borderRadius: "8px",
        border: `1px solid ${color.border}`,
      }}
    >
      <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "4px" }}>
        {title}
      </div>
      <div style={{ fontSize: "18px", fontWeight: "600", color: color.text }}>
        {value}
      </div>
      {detail && (
        <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
          {detail}
        </div>
      )}
    </div>
  );
}

function TableRow({ label, value, link }) {
  return (
    <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
      <td style={{ padding: "12px 0", color: "#6b7280", width: "200px" }}>
        {label}
      </td>
      <td style={{ padding: "12px 0", color: "#1f2937", fontWeight: "500" }}>
        {link ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3b82f6" }}
          >
            {value}
          </a>
        ) : (
          value
        )}
      </td>
    </tr>
  );
}

function ErrorGuide({ error, cause, solution }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 2fr",
        gap: "12px",
        padding: "12px",
        background: "#fef2f2",
        borderRadius: "8px",
        border: "1px solid #fecaca",
        fontSize: "13px",
      }}
    >
      <div>
        <div style={{ color: "#991b1b", fontWeight: "600" }}>{error}</div>
      </div>
      <div style={{ color: "#7f1d1d" }}>{cause}</div>
      <div style={{ color: "#166534" }}>{solution}</div>
    </div>
  );
}

function SelectorRow({ name, list, content }) {
  return (
    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
      <td style={{ padding: "8px 10px", fontWeight: "500" }}>{name}</td>
      <td
        style={{
          padding: "8px 10px",
          fontFamily: "monospace",
          color: "#7c3aed",
        }}
      >
        {list}
      </td>
      <td
        style={{
          padding: "8px 10px",
          fontFamily: "monospace",
          color: "#059669",
        }}
      >
        {content}
      </td>
    </tr>
  );
}
