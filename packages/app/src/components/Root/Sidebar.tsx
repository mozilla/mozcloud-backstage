import HomeIcon from '@material-ui/icons/Home';
import CategoryIcon from '@material-ui/icons/Category';
import LibraryBooks from '@material-ui/icons/LibraryBooks';
import CreateComponentIcon from '@material-ui/icons/AddCircleOutline';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import GroupIcon from '@material-ui/icons/People';
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
      <SidebarItem icon={LibraryBooks} to="docs" text="Docs" />
      <SidebarItem icon={CreateComponentIcon} to="create" text="Create..." />
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
