import { useContext } from "react";

import { StateContext } from "@/context/State.context";

export const useWidgetState = () => useContext(StateContext);
