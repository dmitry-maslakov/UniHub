import { Box } from '@mantine/core';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import classes from './qr-tile.module.css';

// A QR code as inline SVG paths (no image, so the page's CSP stays as it is).
// White with ink modules in both schemes: the one place colors are written out.
export function QrTile({ value }: { value: string }) {
  const { t } = useTranslation('auth');
  return (
    <Box className={classes.tile}>
      <QRCodeSVG
        value={value}
        size={208}
        level="M"
        marginSize={2}
        bgColor="#ffffff"
        fgColor="#171b1c"
        title={t('phone.qrTitle')}
      />
    </Box>
  );
}
