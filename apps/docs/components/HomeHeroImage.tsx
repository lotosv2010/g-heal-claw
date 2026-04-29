import React from "react";

// 复刻 Rspress 2.x rp-home-hero__image：Logo + 双光晕 + 伪浏览器窗口 + 骨架屏 + 代码块
export function HomeHeroImage(): JSX.Element {
  return (
    <div className="ghc-hero-wrapper">
      <img className="ghc-hero-logo" src="/logo.svg" alt="g-heal-claw" />
      <div className="ghc-hero-glow ghc-hero-glow--left" />
      <div className="ghc-hero-glow ghc-hero-glow--right" />

      <div className="ghc-hero-browser">
        <div className="ghc-hero-nav">
          <div className="ghc-hero-nav-left">
            <img src="/logo.svg" alt="g-heal-claw" />
            <span>g-heal-claw</span>
          </div>
          <div className="ghc-hero-nav-right">
            <div className="ghc-hero-fake-search">
              <svg width="14" height="14" viewBox="0 0 20 21" fill="none">
                <path
                  fill="currentColor"
                  d="M8.333 1.913A6.667 6.667 0 0 1 15 8.58c0 1.54-.525 2.957-1.402 4.085l4.49 4.492a.834.834 0 0 1-1.177 1.178l-4.491-4.49a6.64 6.64 0 0 1-4.087 1.402 6.667 6.667 0 0 1 0-13.334m0 1.667a5 5 0 1 0 0 10 5 5 0 0 0 0-10"
                />
              </svg>
            </div>
            <div className="ghc-hero-nav-item">中文</div>
            <div className="ghc-hero-nav-item ghc-hero-nav-icon">
              <svg width="14" height="14" viewBox="0 0 19 19" fill="none">
                <path
                  fill="currentColor"
                  d="M9.166 0a9.2 9.2 0 0 1 1.857.188.834.834 0 0 1 .042 1.623 4.47 4.47 0 1 0 5.457 5.457l.048-.135a.834.834 0 0 1 1.575.177q.186.902.188 1.856A9.168 9.168 0 1 1 9.166 0"
                />
              </svg>
            </div>
            <div className="ghc-hero-nav-item ghc-hero-nav-icon">
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="ghc-hero-body">
          <div className="ghc-hero-sidebar">
            <div className="ghc-hero-sidebar-header" style={{ width: "45%" }} />
            <div className="ghc-hero-sidebar-item ghc-hero-sidebar-active">
              <div style={{ width: "70%" }} />
            </div>
            <div className="ghc-hero-sidebar-item">
              <div style={{ width: "50%" }} />
            </div>
            <div
              className="ghc-hero-sidebar-header"
              style={{ width: "60%", marginTop: 12 }}
            />
            <div className="ghc-hero-sidebar-item">
              <div style={{ width: "40%" }} />
            </div>
            <div className="ghc-hero-sidebar-item">
              <div style={{ width: "60%" }} />
            </div>
            <div className="ghc-hero-sidebar-item">
              <div style={{ width: "50%" }} />
            </div>
          </div>

          <div className="ghc-hero-main">
            <div className="ghc-hero-title">异常分析</div>
            <div className="ghc-hero-skel" />
            <div className="ghc-hero-skel" />
            <div className="ghc-hero-code">
              <div className="ghc-hero-code-title">dashboard.tsx</div>
              <pre className="ghc-hero-code-body">
                <code>
                  <span className="ghc-hero-code-line">
                    <span className="ghc-k">import</span>{" "}
                    <span className="ghc-p">{"{"}</span>{" "}
                    <span className="ghc-v">init</span>{" "}
                    <span className="ghc-p">{"}"}</span>{" "}
                    <span className="ghc-k">from</span>{" "}
                    <span className="ghc-s">"@g-heal-claw/sdk"</span>
                    <span className="ghc-p">;</span>
                  </span>
                  <br />
                  <span className="ghc-hero-code-line">
                    <span className="ghc-f">init</span>
                    <span className="ghc-p">({"{"}</span>{" "}
                    <span className="ghc-v">dsn</span>
                    <span className="ghc-p">:</span>{" "}
                    <span className="ghc-s">"..."</span>{" "}
                    <span className="ghc-p">{"}"})</span>
                    <span className="ghc-p">;</span>
                  </span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
