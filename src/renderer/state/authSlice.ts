import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthCompany, AuthOffice, AuthProfile, AuthUser } from '../shared/types/auth';
import type { RootState } from './configureStore';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  user?: AuthUser;
  permissions: string[];
  offices: AuthOffice[];
  companies: AuthCompany[];
  signedOut: boolean;
}

const initialState: AuthState = {
  status: 'unknown',
  user: undefined,
  permissions: [],
  offices: [],
  companies: [],
  signedOut: false
};

export const authSlice = createSlice({
  name: 'authSlice',
  initialState,
  reducers: {
    setProfile: (state, action: PayloadAction<Omit<AuthProfile, 'csrfToken'>>) => {
      state.status = 'authenticated';
      state.user = action.payload.user;
      state.permissions = action.payload.permissions;
      state.offices = action.payload.offices;
      state.companies = action.payload.companies;
      state.signedOut = false;
    },
    clearAuth: () => ({ ...initialState, status: 'anonymous' as const }),
    signedOut: () => ({ ...initialState, status: 'anonymous' as const, signedOut: true }),
    setMustChangePassword: (state, action: PayloadAction<boolean>) => {
      if (state.user) state.user.mustChangePassword = action.payload;
    }
  }
});

const selectAuth = (state: RootState) => state.authSlice;
export const selectAuthStatus = createSelector(selectAuth, state => state.status);
export const selectSignedOut = createSelector(selectAuth, state => state.signedOut);
export const selectAuthUser = createSelector(selectAuth, state => state.user);
export const selectPermissions = createSelector(selectAuth, state => state.permissions);
export const selectPermissionSet = createSelector(selectPermissions, permissions => new Set(permissions));
export const selectAuthOffices = createSelector(selectAuth, state => state.offices);
export const selectAuthCompanies = createSelector(selectAuth, state => state.companies);

export const { setProfile, clearAuth, signedOut, setMustChangePassword } = authSlice.actions;
