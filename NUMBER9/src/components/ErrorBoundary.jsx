import React from "react";
import { CTX } from "../i18n/context";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static contextType = CTX;

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch() {}

  render() {
    if (this.state.hasError) {
      const t = this.context?.t || ((k) => k);
      return (
        <div style={{ padding: 20, color: "red" }}>
          {t('error.ui_crash')}
        </div>
      );
    }

    return this.props.children;
  }
}
