import { Grid, useMediaQuery, useTheme } from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { Content } from '../../shared/components/layout/content/Content';
import { NoItem } from '../../shared/components/lists/noItem/NoItem';
import type { AmountFormat } from '../../shared/enums/amountFormat';
import type { DateFormat } from '../../shared/enums/dateFormat';
import type { Language } from '../../shared/enums/language';
import { MenuItemSettings } from '../../shared/enums/menuItemSettings';
import { useSettingsUpdate } from '../../shared/hooks/settings/useSettingsUpdate';
import type { Response } from '../../shared/types/response';
import { useAppDispatch, useAppSelector } from '../../state/configureStore';
import {
  addToast,
  selectSettings,
  setCustomInvoiseSettings,
  setEInvoiceUBL,
  setEInvoiceXRechnung,
  setLanguageDate,
  setMode,
  setPresets,
  setQuotes,
  setReports,
  setStyleProfiles
} from '../../state/pageSlice';
import { CustomizeInvoice } from './content/CustomizeInvoice';
import { LanguageFormat } from './content/LanguageFormat';
import { Menu } from './menu/Menu';

export const SettingsPage = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const [currentMenuItem, setCurrentMenuItem] = useState<MenuItemSettings | undefined>(undefined);
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const dispatch = useAppDispatch();
  const storeSettings = useAppSelector(selectSettings);
  const hasInitialized = useRef(false);
  const stableSettings = useMemo(() => storeSettings ?? {}, [storeSettings]);

  const { execute } = useSettingsUpdate({
    newSettings: stableSettings ?? {},
    immediate: false,
    onDone: (data: Response<unknown>) => {
      if (!data.success) {
        if (data.message) {
          const message = i18n.exists(data.message) ? t(data.message) : data.message;
          dispatch(addToast({ message: message, severity: 'error' }));
        } else if (data.key) dispatch(addToast({ message: t(data.key), severity: 'error' }));
      }
    }
  });

  const onModeChange = useCallback(
    (isDark: boolean) => {
      dispatch(setMode(isDark));
    },
    [dispatch]
  );

  const toggleQuotes = useCallback(
    (value: boolean) => {
      dispatch(setQuotes(value));
    },
    [dispatch]
  );

  const toggleStyleProfiles = useCallback(
    (value: boolean) => {
      dispatch(setStyleProfiles(value));
    },
    [dispatch]
  );

  const togglePresets = useCallback(
    (value: boolean) => {
      dispatch(setPresets(value));
    },
    [dispatch]
  );

  const toggleUBL = useCallback(
    (value: boolean) => {
      dispatch(setEInvoiceUBL(value));
    },
    [dispatch]
  );

  const toggleXRechnung = useCallback(
    (value: boolean) => {
      dispatch(setEInvoiceXRechnung(value));
    },
    [dispatch]
  );

  const toggleReports = useCallback(
    (value: boolean) => {
      dispatch(setReports(value));
    },
    [dispatch]
  );

  const onCustomizedInvoice = useCallback(
    (data: {
      suffix?: string;
      prefix?: string;
      includeMonth: boolean;
      includeYear: boolean;
      includeBusinessName: boolean;
    }) => {
      dispatch(
        setCustomInvoiseSettings({
          invoicePrefix: data.prefix,
          invoiceSuffix: data.suffix,
          shouldIncludeMonth: data.includeMonth,
          shouldIncludeYear: data.includeYear,
          shouldIncludeBusinessName: data.includeBusinessName
        })
      );
    },
    [dispatch]
  );

  const onLanguageFormat = useCallback(
    (data: { language: Language; amountFormat: AmountFormat; dateFormat: DateFormat }) => {
      i18n.changeLanguage(data.language);
      localStorage.setItem('lastUsedLanguage', data.language);

      dispatch(
        setLanguageDate({
          language: data.language,
          amountFormat: data.amountFormat,
          dateFormat: data.dateFormat
        })
      );
    },
    [dispatch]
  );

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      return;
    }

    execute();
  }, [stableSettings, execute]);

  const onSelected = useCallback((item: MenuItemSettings | undefined) => {
    setCurrentMenuItem(item);
  }, []);

  const onBack = useCallback(() => {
    setCurrentMenuItem(undefined);
  }, []);

  let rightColumn: ReactNode;
  if (typeof currentMenuItem === 'undefined') {
    rightColumn = <NoItem text={t('app.noItems')} />;
  } else {
    switch (currentMenuItem) {
      case MenuItemSettings.Receipt:
        rightColumn = (
          <CustomizeInvoice onCustomizedInvoice={onCustomizedInvoice} showBack={!isDesktop} onBack={onBack} />
        );
        break;
      case MenuItemSettings.LanguageFormat:
        rightColumn = <LanguageFormat onLanguageFormat={onLanguageFormat} showBack={!isDesktop} onBack={onBack} />;
        break;
      default:
        rightColumn = <NoItem text={t('app.noItems')} />;
        break;
    }
  }

  const leftColumnMenu = (
    <Menu
      onSelected={onSelected}
      selectedMenu={currentMenuItem}
      onModeChange={onModeChange}
      toggleQuotes={toggleQuotes}
      toggleReports={toggleReports}
      toggleStyleProfiles={toggleStyleProfiles}
      togglePresets={togglePresets}
      toggleUBL={toggleUBL}
      toggleXRechnung={toggleXRechnung}
    />
  );

  return (
    <Grid
      container
      component="div"
      spacing={2}
      sx={{ height: '100%', justifyContent: 'center', alignItems: 'stretch' }}
    >
      {isDesktop ? (
        <>
          {leftColumnMenu}
          <Content node={rightColumn} />
        </>
      ) : (
        <>{typeof currentMenuItem === 'undefined' ? leftColumnMenu : <Content node={rightColumn} />}</>
      )}
    </Grid>
  );
};
