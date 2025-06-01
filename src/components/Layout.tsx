import type { ReactNode } from 'react'
import { Box, type BoxProps } from 'ink'
import Footer from './Footer'
import Header from './Header'

type LayoutProps = {
  children: ReactNode
  width?: number // Terminal width in columns

  footer?: ReactNode
} & BoxProps

export default function Layout({
  children,

  width = 80, // default width to fit most terminals
  footer,
  ...boxProps
}: LayoutProps) {
  return (
    <Box flexDirection="column" width={width} {...boxProps}>
      <Header />
      <Box flexGrow={1} flexDirection="column" padding={1}>
        {children}
      </Box>
      <Footer />
    </Box>
  )
}
