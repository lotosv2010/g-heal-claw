import React, { useState } from "react";

interface Manager {
  key: string;
  label: string;
  bin: string;
  args: string;
  icon: JSX.Element;
}

const MANAGERS: Manager[] = [
  {
    key: "npm",
    label: "npm",
    bin: "npm",
    args: "install @g-heal-claw/sdk",
    icon: (
      <svg width="16" height="16" viewBox="0 0 256 256">
        <path fill="#C12127" d="M0 256V0h256v256z" />
        <path fill="#FFF" d="M48 48h160v160h-32V80h-48v128H48z" />
      </svg>
    ),
  },
  {
    key: "pnpm",
    label: "pnpm",
    bin: "pnpm",
    args: "add @g-heal-claw/sdk",
    icon: (
      <svg width="16" height="16" viewBox="0 0 128 128">
        <path
          fill="#f8ab00"
          d="M0 .004V40h39.996V.004Zm43.996 0V40h40V.004Zm44.008 0V40H128V.004Zm0 43.996v39.996H128V44Z"
        />
        <path
          fill="#4c4c4c"
          d="M43.996 44v39.996h40V44ZM0 87.996v40h39.996v-40Zm43.996 0v40h40v-40Zm44.008 0v40H128v-40Z"
        />
      </svg>
    ),
  },
  {
    key: "yarn",
    label: "yarn",
    bin: "yarn",
    args: "add @g-heal-claw/sdk",
    icon: (
      <svg width="16" height="16" viewBox="0 0 128 128">
        <g fill="#2c8ebb">
          <path d="M64 2a62 62 0 1 0 62 62A62 62 0 0 0 64 2zm37.3 87.83c-3.35.81-4.91 1.44-9.41 4.36a67 67 0 0 1-15.56 7.18 8.71 8.71 0 0 1-3.64 1.77c-3.81.93-16.88 1.63-17.91 1.63h-.24c-4 0-6.27-1.24-7.49-2.54-3.4 1.7-7.8 1-11-.69a5.55 5.55 0 0 1-3-3.9 6 6 0 0 1 0-2.06 6.66 6.66 0 0 1-.79-1A16.38 16.38 0 0 1 30 84.52c.29-3.73 2.87-7.06 4.55-8.83A28.56 28.56 0 0 1 36.61 64a26.82 26.82 0 0 1 6.82-9c-1.65-2.78-3.33-7.06-1.7-11.42 1.17-3.11 2.13-4.84 4.24-5.58a6.84 6.84 0 0 0 2.51-1.34A17.65 17.65 0 0 1 60.34 31c.19-.48.41-1 .65-1.46 1.6-3.4 3.3-5.31 5.29-6a4.88 4.88 0 0 1 4.4.5c.65.43 1.48 1 3.9 6a4.69 4.69 0 0 1 2.85-.1 3.81 3.81 0 0 1 2.39 1.94c2.47 4.74 2.8 13.19 1.72 18.62a33.8 33.8 0 0 1-5.84 13.31 25.73 25.73 0 0 1 5.77 9.43 25.42 25.42 0 0 1 1.41 10.41A28.7 28.7 0 0 0 86 81.91c3.06-1.89 7.68-4.74 13.19-4.81a6.62 6.62 0 0 1 7 5.7 6.35 6.35 0 0 1-4.89 7.03z" />
        </g>
      </svg>
    ),
  },
];

export function InstallTabs(): JSX.Element {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const current = MANAGERS[active];
  const fullCmd = `${current.bin} ${current.args}`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(fullCmd);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="ghc-install">
      <div className="ghc-install__tabs" role="tablist">
        {MANAGERS.map((m, i) => (
          <button
            key={m.key}
            role="tab"
            aria-selected={active === i}
            className={`ghc-install__tab ${active === i ? "ghc-install__tab--active" : ""}`}
            onClick={() => setActive(i)}
          >
            {m.icon}
            <span>{m.label}</span>
          </button>
        ))}
      </div>
      <div className="ghc-install__panel">
        <code className="ghc-install__cmd">
          <span className="ghc-install__bin">{current.bin}</span>{" "}
          <span className="ghc-install__args">{current.args}</span>
        </code>
        <button
          type="button"
          className="ghc-install__copy"
          onClick={handleCopy}
          title="复制"
          aria-label="复制命令"
        >
          {copied ? (
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="m9.55 18-5.7-5.7 1.425-1.425L9.55 15.15l9.175-9.175L20.15 7.4z"
              />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M20 8v12H8V8zm0-2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2"
              />
              <path fill="currentColor" d="M4 16H2V4a2 2 0 0 1 2-2h12v2H4Z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
