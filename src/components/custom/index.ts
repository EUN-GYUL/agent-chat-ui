import { JSXGraphInteractive } from "./JSXGraphInteractive";

// LoadExternalComponent passes props dynamically from UI messages,
// so we need to cast components that have required props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CUSTOM_COMPONENTS: Record<string, React.FunctionComponent<any>> = {
  jsxgraph_interactive: JSXGraphInteractive,
};
