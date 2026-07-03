module.exports = {
  theme: {
    extend: {
      colors: {
        ww: {
          canvas: "#f4f4f1",
          wireframePanel: "#f6f6f2",
          card: "#ffffff",
          panel: "#ffffff",
          ink: "#141414",
          muted: "#585858",
          support: "#6f6f6a",
          border: "#d6d6d0"
        }
      },
      spacing: {
        "crm-shell-x": "24px",
        "crm-shell-y": "24px",
        "crm-gutter": "12px",
        "crm-chip-y": "5px",
        "crm-chip-x": "8px"
      },
      borderRadius: {
        "crm-shell": "20px",
        "crm-card": "14px",
        "crm-small": "10px",
        "crm-control": "8px"
      },
      fontSize: {
        "crm-title": ["36px", { lineHeight: "1" }],
        "crm-section": ["16px", { lineHeight: "1.2" }],
        "crm-label": ["11px", { lineHeight: "1.2" }],
        "crm-metric": ["44px", { lineHeight: "1" }]
      },
      boxShadow: {
        "crm-panel": "0 14px 38px -22px rgba(20,20,20,0.35)",
        "crm-card": "0 12px 28px -24px rgba(20,20,20,0.32)"
      }
    }
  }
};

