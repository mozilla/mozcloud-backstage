import HomeIcon from '@material-ui/icons/Home';
import CategoryIcon from '@material-ui/icons/Category';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import GroupIcon from '@material-ui/icons/People';
import BuildIcon from '@material-ui/icons/Build';
import AddCircleOutlineIcon from '@material-ui/icons/AddCircleOutline';
import {
  Settings as SidebarSettings,
  UserSettingsSignInAvatar,
} from '@backstage/plugin-user-settings';
import { SidebarSearchModal } from '@backstage/plugin-search';
import {
  Sidebar as BackstageSidebar,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
  SidebarScrollWrapper,
  SidebarSpace,
} from '@backstage/core-components';
import { MyGroupsSidebarItem } from '@backstage/plugin-org';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { devToolsAdministerPermission } from '@backstage/plugin-devtools-common';
import { SidebarLogo } from './SidebarLogo';

export const Sidebar = () => (
  <BackstageSidebar>
    <SidebarLogo />
    <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
      <SidebarSearchModal />
    </SidebarGroup>
    <SidebarDivider />
    <SidebarGroup label="Menu" icon={<MenuIcon />}>
      <SidebarItem icon={HomeIcon} to="" text="Home" />
      <SidebarItem icon={CategoryIcon} to="catalog" text="Catalog" />
      <MyGroupsSidebarItem
        singularTitle="My Group"
        pluralTitle="My Groups"
        icon={GroupIcon}
      />
      <RequirePermission
        permission={devToolsAdministerPermission}
        errorPage={<></>}
      >
        <SidebarItem icon={BuildIcon} to="devtools" text="DevTools" />
      </RequirePermission>
      {/* <SidebarItem icon={LibraryBooks} to="docs" text="Docs" /> */}
      <SidebarItem icon={AddCircleOutlineIcon} to="create" text="Create..." />
      <SidebarDivider />
      <SidebarScrollWrapper />
    </SidebarGroup>
    <SidebarSpace />
    <SidebarDivider />
    <SidebarGroup
      label="Settings"
      icon={<UserSettingsSignInAvatar />}
      to="/settings"
    >
      <SidebarSettings />
    </SidebarGroup>
  </BackstageSidebar>
);
