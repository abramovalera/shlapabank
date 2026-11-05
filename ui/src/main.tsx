import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./api/hooks";
import { useSession } from "./api/session";
import { App } from "./app/App";
import "./index.css";

// Выход (в т.ч. по 401) — чистим кэш, чтобы данные прошлого клиента не мелькнули следующему
useSession.subscribe((state, prev) => {
  if (prev.token && !state.token) queryClient.clear();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
