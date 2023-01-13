// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import React, {useEffect, useState} from 'react'
import {FormattedMessage, IntlShape, useIntl} from 'react-intl'

import {Board, IPropertyTemplate} from '../../blocks/board'
import {Card} from '../../blocks/card'
import {BoardView} from '../../blocks/boardView'

import mutator from '../../mutator'
import Button from '../../widgets/buttons/button'
import MenuWrapper from '../../widgets/menuWrapper'
import PropertyMenu, {PropertyTypes} from '../../widgets/propertyMenu'

import Calculations from '../calculations/calculations'
import PropertyValueElement from '../propertyValueElement'
import ConfirmationDialogBox, {ConfirmationDialogBoxProps} from '../confirmationDialogBox'
import {sendFlashMessage} from '../flashMessages'
import Menu from '../../widgets/menu'
import {IDType, Utils} from '../../utils'
import AddPropertiesTourStep from '../onboardingTour/addProperties/add_properties'
import {Permission} from '../../constants'
import {useHasCurrentBoardPermissions} from '../../hooks/permissions'
import propRegistry from '../../properties'
import {PropertyType} from '../../properties/types'
import {useSortableWithGrip} from '../../hooks/sortable'
import {IContentBlockWithCords} from '../../blocks/contentBlock'

import {dragAndDropRearrange} from './cardDetailContentsUtility'
import {Position} from './cardDetailContents'

function moveBlock(card: Card, srcBlock: IContentBlockWithCords, dstBlock: IContentBlockWithCords, intl: IntlShape, moveTo: Position): void {
    const contentOrder: Array<string | string[]> = []
    if (card.fields.contentOrder) {
        for (const contentId of card.fields.contentOrder) {
            if (typeof contentId === 'string') {
                contentOrder.push(contentId)
            } else {
                contentOrder.push(contentId.slice())
            }
        }
    }

    const srcBlockId = srcBlock.block.id
    const dstBlockId = dstBlock.block.id

    const srcBlockX = srcBlock.cords.x
    const dstBlockX = dstBlock.cords.x

    const srcBlockY = (srcBlock.cords.y || srcBlock.cords.y === 0) && (srcBlock.cords.y > -1) ? srcBlock.cords.y : -1
    const dstBlockY = (dstBlock.cords.y || dstBlock.cords.y === 0) && (dstBlock.cords.y > -1) ? dstBlock.cords.y : -1

    if (srcBlockId === dstBlockId) {
        return
    }

    const newContentOrder = dragAndDropRearrange({contentOrder, srcBlockId, srcBlockX, srcBlockY, dstBlockId, dstBlockX, dstBlockY, moveTo})

    mutator.performAsUndoGroup(async () => {
        const description = intl.formatMessage({id: 'CardDetail.moveContent', defaultMessage: 'Move card content'})
        await mutator.changeCardContentOrder(card.boardId, card.id, card.fields.contentOrder, newContentOrder, description)
    })
}

type CardPropertyWithDragAndDropProps = {
    x: number
    card: Card
    propertyLength: number
    intl: IntlShape
    readonly: boolean
    propertyTemplate: IPropertyTemplate
    canEditBoardProperties: boolean
    board: Board
    canEditBoardCards: boolean
    newTemplateId: string
    onPropertyChangeSetAndOpenConfirmationDialog: (newType: PropertyType, newName: string, propertyTemplate: IPropertyTemplate) => void
    onPropertyDeleteSetAndOpenConfirmationDialog: (propertyTemplate: IPropertyTemplate) => void
}

const CardPropertyWithDragAndDrop = (props: CardPropertyWithDragAndDropProps) => {
    const [, isOver, , itemRef] = useSortableWithGrip('property', {block: props.card, cords: {x: props.x}}, true, (src, dst) => moveBlock(props.card, src, dst, props.intl, 'aboveRow'))
    const [, isOver2, , itemRef2] = useSortableWithGrip('property', {block: props.card, cords: {x: props.x}}, true, (src, dst) => moveBlock(props.card, src, dst, props.intl, 'belowRow'))

    return (
        <div>
            <div
                ref={itemRef}
                className={`addToRow ${isOver ? 'dragover' : ''}`}
                style={{width: '94%', height: '10px', marginLeft: '48px'}}
            />
            <div
                key={props.propertyTemplate.id + '-' + props.propertyTemplate.type}
                className='octo-propertyrow'
            >
                {(props.readonly || !props.canEditBoardProperties) && <div className='octo-propertyname octo-propertyname--readonly'>{props.propertyTemplate.name}</div>}
                {!props.readonly && props.canEditBoardProperties &&
                    <MenuWrapper isOpen={props.propertyTemplate.id === props.newTemplateId}>
                        <div className='octo-propertyname'><Button>{props.propertyTemplate.name}</Button></div>
                        <PropertyMenu
                            propertyId={props.propertyTemplate.id}
                            propertyName={props.propertyTemplate.name}
                            propertyType={propRegistry.get(props.propertyTemplate.type)}
                            onTypeAndNameChanged={(newType: PropertyType, newName: string) => props.onPropertyChangeSetAndOpenConfirmationDialog(newType, newName, props.propertyTemplate)}
                            onDelete={() => props.onPropertyDeleteSetAndOpenConfirmationDialog(props.propertyTemplate)}
                        />
                    </MenuWrapper>
                }
                <PropertyValueElement
                    readOnly={props.readonly || !props.canEditBoardCards}
                    card={props.card}
                    board={props.board}
                    propertyTemplate={props.propertyTemplate}
                    showEmptyPlaceholder={true}
                />
            </div>
            {props.x === props.propertyLength - 1 && (
                <div
                    ref={itemRef2}
                    className={`addToRow ${isOver2 ? 'dragover' : ''}`}
                    style={{width: '94%', height: '10px', marginLeft: '48px'}}
                />
            )}
        </div>

    )
}

type Props = {
    board: Board
    card: Card
    cards: Card[]
    activeView: BoardView
    views: BoardView[]
    readonly: boolean
}

const CardDetailProperties = (props: Props) => {
    const {board, card, cards, views, activeView} = props
    const [newTemplateId, setNewTemplateId] = useState('')
    const canEditBoardProperties = useHasCurrentBoardPermissions([Permission.ManageBoardProperties])
    const canEditBoardCards = useHasCurrentBoardPermissions([Permission.ManageBoardCards])
    const intl = useIntl()

    useEffect(() => {
        const newProperty = board.cardProperties.find((property) => property.id === newTemplateId)
        if (newProperty) {
            setNewTemplateId('')
        }
    }, [newTemplateId, board.cardProperties])

    const [confirmationDialogBox, setConfirmationDialogBox] = useState<ConfirmationDialogBoxProps>({heading: '', onConfirm: () => { }, onClose: () => { }})
    const [showConfirmationDialog, setShowConfirmationDialog] = useState<boolean>(false)

    function onPropertyChangeSetAndOpenConfirmationDialog(newType: PropertyType, newName: string, propertyTemplate: IPropertyTemplate) {
        const oldType = propRegistry.get(propertyTemplate.type)

        // do nothing if no change
        if (oldType === newType && propertyTemplate.name === newName) {
            return
        }

        const affectsNumOfCards: string = Calculations.countNotEmpty(cards, propertyTemplate, intl)

        // if only the name has changed, set the property without warning
        if (affectsNumOfCards === '0' || oldType === newType) {
            mutator.changePropertyTypeAndName(board, cards, propertyTemplate, newType.type, newName)
            return
        }

        const subTextString = intl.formatMessage({
            id: 'CardDetailProperty.property-name-change-subtext',
            defaultMessage: 'type from "{oldPropType}" to "{newPropType}"',
        }, {oldPropType: oldType.displayName(intl), newPropType: newType.displayName(intl)})

        setConfirmationDialogBox({
            heading: intl.formatMessage({id: 'CardDetailProperty.confirm-property-type-change', defaultMessage: 'Confirm property type change'}),
            subText: intl.formatMessage({
                id: 'CardDetailProperty.confirm-property-name-change-subtext',
                defaultMessage: 'Are you sure you want to change property "{propertyName}" {customText}? This will affect value(s) across {numOfCards} card(s) in this board, and can result in data loss.',
            },
            {
                propertyName: propertyTemplate.name,
                customText: subTextString,
                numOfCards: affectsNumOfCards,
            }),

            confirmButtonText: intl.formatMessage({id: 'CardDetailProperty.property-change-action-button', defaultMessage: 'Change property'}),
            onConfirm: async () => {
                setShowConfirmationDialog(false)
                try {
                    await mutator.changePropertyTypeAndName(board, cards, propertyTemplate, newType.type, newName)
                } catch (err: any) {
                    Utils.logError(`Error Changing Property And Name:${propertyTemplate.name}: ${err?.toString()}`)
                }
                sendFlashMessage({content: intl.formatMessage({id: 'CardDetailProperty.property-changed', defaultMessage: 'Changed property successfully!'}), severity: 'high'})
            },
            onClose: () => setShowConfirmationDialog(false),
        })

        // open confirmation dialog for property type change
        setShowConfirmationDialog(true)
    }

    function onPropertyDeleteSetAndOpenConfirmationDialog(propertyTemplate: IPropertyTemplate) {
        // set ConfirmationDialogBox Props
        setConfirmationDialogBox({
            heading: intl.formatMessage({id: 'CardDetailProperty.confirm-delete-heading', defaultMessage: 'Confirm delete property'}),
            subText: intl.formatMessage({
                id: 'CardDetailProperty.confirm-delete-subtext',
                defaultMessage: 'Are you sure you want to delete the property "{propertyName}"? Deleting it will delete the property from all cards in this board.',
            },
            {propertyName: propertyTemplate.name}),
            confirmButtonText: intl.formatMessage({id: 'CardDetailProperty.delete-action-button', defaultMessage: 'Delete'}),
            onConfirm: async () => {
                const deletingPropName = propertyTemplate.name
                setShowConfirmationDialog(false)
                try {
                    await mutator.deleteProperty(board, views, cards, propertyTemplate.id)
                    sendFlashMessage({content: intl.formatMessage({id: 'CardDetailProperty.property-deleted', defaultMessage: 'Deleted {propertyName} successfully!'}, {propertyName: deletingPropName}), severity: 'high'})
                } catch (err: any) {
                    Utils.logError(`Error Deleting Property!: Could Not delete Property -" + ${deletingPropName} ${err?.toString()}`)
                }
            },

            onClose: () => setShowConfirmationDialog(false),
        })

        // open confirmation dialog property delete
        setShowConfirmationDialog(true)
    }

    return (
        <div className='octo-propertylist CardDetailProperties'>
            {board.cardProperties.map((propertyTemplate: IPropertyTemplate, x) => {
                return (
                    <CardPropertyWithDragAndDrop
                        key={x}
                        card={card}
                        x={x}
                        intl={intl}
                        readonly={props.readonly}
                        board={board}
                        propertyLength={board.cardProperties.length}
                        canEditBoardCards={canEditBoardCards}
                        canEditBoardProperties={canEditBoardProperties}
                        newTemplateId={newTemplateId}
                        onPropertyChangeSetAndOpenConfirmationDialog={onPropertyChangeSetAndOpenConfirmationDialog}
                        onPropertyDeleteSetAndOpenConfirmationDialog={onPropertyDeleteSetAndOpenConfirmationDialog}
                        propertyTemplate={propertyTemplate}
                    />
                )
            })}

            {showConfirmationDialog && (
                <ConfirmationDialogBox
                    dialogBox={confirmationDialogBox}
                />
            )}

            {!props.readonly && canEditBoardProperties &&
                <div className='octo-propertyname add-property'>
                    <MenuWrapper>
                        <Button>
                            <FormattedMessage
                                id='CardDetail.add-property'
                                defaultMessage='+ Add a property'
                            />
                        </Button>
                        <Menu>
                            <PropertyTypes
                                label={intl.formatMessage({id: 'PropertyMenu.selectType', defaultMessage: 'Select property type'})}
                                onTypeSelected={async (type) => {
                                    const template: IPropertyTemplate = {
                                        id: Utils.createGuid(IDType.BlockID),
                                        name: type.displayName(intl),
                                        type: type.type,
                                        options: [],
                                    }
                                    const templateId = await mutator.insertPropertyTemplate(board, activeView, -1, template)
                                    setNewTemplateId(templateId)
                                }}
                            />
                        </Menu>
                    </MenuWrapper>

                    <AddPropertiesTourStep/>
                </div>
            }
        </div>
    )
}

export default React.memo(CardDetailProperties)
