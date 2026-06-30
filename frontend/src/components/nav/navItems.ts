import type { SvgIconProps } from "@mui/material/SvgIcon";
import type { ComponentType } from "react";

export interface NavItem {
  label: string;
  href: string;
  ActiveIcon: ComponentType<SvgIconProps>;
  InactiveIcon: ComponentType<SvgIconProps>;
  requiresAdmin?: boolean;
}

// Resolved at import time to avoid dynamic requires in RSC boundaries
import DashboardIcon from "@mui/icons-material/Dashboard";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import TravelExploreOutlinedIcon from "@mui/icons-material/TravelExploreOutlined";
import SendIcon from "@mui/icons-material/Send";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import HandshakeIcon from "@mui/icons-material/Handshake";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import DescriptionIcon from "@mui/icons-material/Description";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import SettingsIcon from "@mui/icons-material/Settings";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    ActiveIcon: DashboardIcon,
    InactiveIcon: DashboardOutlinedIcon,
  },
  {
    label: "Prospection",
    href: "/prospection",
    ActiveIcon: TravelExploreIcon,
    InactiveIcon: TravelExploreOutlinedIcon,
  },
  {
    label: "Outreach",
    href: "/outreach",
    ActiveIcon: SendIcon,
    InactiveIcon: SendOutlinedIcon,
  },
  {
    label: "Négociation",
    href: "/negociation",
    ActiveIcon: HandshakeIcon,
    InactiveIcon: HandshakeOutlinedIcon,
  },
  {
    label: "Contrats",
    href: "/contrats",
    ActiveIcon: DescriptionIcon,
    InactiveIcon: DescriptionOutlinedIcon,
  },
  {
    label: "Paramètres",
    href: "/settings",
    ActiveIcon: SettingsIcon,
    InactiveIcon: SettingsOutlinedIcon,
    requiresAdmin: true,
  },
];

export default navItems;

export function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
