// This is the first HTML entry: isolate storage before validating any return token.
import "@estg/shared";
import { gateSortHandoff } from "./sort-return-core";

const cleaned = gateSortHandoff(window.location.search, window.location.href);
if (cleaned) window.history.replaceState({}, "", cleaned);
