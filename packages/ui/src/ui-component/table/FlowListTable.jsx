import PropTypes from 'prop-types'
import { useSelector } from 'react-redux'
import moment from 'moment'
import { styled } from '@mui/material/styles'
import {
    Box,
    Chip,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Stack,
    Typography,
    useTheme
} from '@mui/material'
import { tableCellClasses } from '@mui/material/TableCell'
import FlowListMenu from '../button/FlowListMenu'
import { Link } from 'react-router-dom'

const StyledTableCell = styled(TableCell)(({ theme }) => ({
    borderColor: theme.palette.grey[900] + 25,

    [`&.${tableCellClasses.head}`]: {
        color: theme.palette.grey[900]
    },
    [`&.${tableCellClasses.body}`]: {
        fontSize: 14,
        height: 64
    }
}))

const StyledTableRow = styled(TableRow)(() => ({
    // hide last border
    '&:last-child td, &:last-child th': {
        border: 0
    }
}))

export const FlowListTable = ({ data, images, filterFunction, updateFlowsApi }) => {
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)

    return (
        <>
            <TableContainer sx={{ border: 1, borderColor: theme.palette.grey[900] + 25, borderRadius: 2 }} component={Paper}>
                <Table sx={{ minWidth: 650 }} size='small' aria-label='a dense table'>
                    <TableHead
                        sx={{
                            backgroundColor: customization.isDarkMode ? theme.palette.common.black : theme.palette.grey[100],
                            height: 56
                        }}
                    >
                        <TableRow>
                            <StyledTableCell component='th' scope='row' style={{ width: '20%' }} key='0'>
                                Name
                            </StyledTableCell>
                            <StyledTableCell style={{ width: '25%' }} key='1'>
                                Category
                            </StyledTableCell>
                            <StyledTableCell style={{ width: '30%' }} key='2'>
                                Nodes
                            </StyledTableCell>
                            <StyledTableCell style={{ width: '15%' }} key='3'>
                                Last Modified Date
                            </StyledTableCell>
                            <StyledTableCell style={{ width: '10%' }} key='4'>
                                Actions
                            </StyledTableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.filter(filterFunction).map((row, index) => (
                            <StyledTableRow key={index}>
                                <StyledTableCell key='0'>
                                    <Typography
                                        sx={{
                                            fontSize: 14,
                                            fontWeight: 500,
                                            overflowWrap: 'break-word',
                                            whiteSpace: 'pre-line'
                                        }}
                                    >
                                        <Link to={`/canvas/${row.id}`} style={{ color: '#2196f3', textDecoration: 'none' }}>
                                            {row.templateName || row.name}
                                        </Link>
                                    </Typography>
                                </StyledTableCell>
                                <StyledTableCell key='1'>
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'row',
                                            flexWrap: 'wrap',
                                            marginTop: 5
                                        }}
                                    >
                                        &nbsp;
                                        {row.category &&
                                            row.category
                                                .split(';')
                                                .map((tag, index) => (
                                                    <Chip key={index} label={tag} style={{ marginRight: 5, marginBottom: 5 }} />
                                                ))}
                                    </div>
                                </StyledTableCell>
                                <StyledTableCell key='2'>
                                    {images[row.id] && (
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'start',
                                                gap: 1
                                            }}
                                        >
                                            {images[row.id].slice(0, images[row.id].length > 5 ? 5 : images[row.id].length).map((img) => (
                                                <Box
                                                    key={img}
                                                    sx={{
                                                        width: 35,
                                                        height: 35,
                                                        borderRadius: '50%',
                                                        backgroundColor: theme.palette.common.white
                                                    }}
                                                >
                                                    <img
                                                        style={{ width: '100%', height: '100%', padding: 5, objectFit: 'contain' }}
                                                        alt=''
                                                        src={img}
                                                    />
                                                </Box>
                                            ))}
                                            {images[row.id].length > 5 && (
                                                <Typography
                                                    sx={{ alignItems: 'center', display: 'flex', fontSize: '.8rem', fontWeight: 200 }}
                                                >
                                                    + {images[row.id].length - 5} More
                                                </Typography>
                                            )}
                                        </Box>
                                    )}
                                </StyledTableCell>
                                <StyledTableCell key='3'>{moment(row.updatedDate).format('MMMM Do, YYYY')}</StyledTableCell>
                                <StyledTableCell key='4'>
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent='center' alignItems='center'>
                                        <FlowListMenu chatflow={row} updateFlowsApi={updateFlowsApi} />
                                    </Stack>
                                </StyledTableCell>
                            </StyledTableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </>
    )
}

FlowListTable.propTypes = {
    data: PropTypes.array,
    images: PropTypes.object,
    filterFunction: PropTypes.func,
    updateFlowsApi: PropTypes.object
}